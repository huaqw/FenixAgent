import Elysia from "elysia";
import { authGuardPlugin } from "../../../plugins/auth";
import { getSection, modifySection } from "../../../services/config";
import { invalidateAvailableCache } from "./models";

type ProviderConfig = {
  npm?: string;
  name?: string;
  options?: { apiKey?: string; baseURL?: string; [key: string]: unknown };
  models?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};
type ProviderBody = { action: string; name?: string; modelId?: string; data?: Record<string, unknown> };

const app = new Elysia({ name: "web-config-providers", prefix: "/web" })
  .use(authGuardPlugin);

/** 从 apiKey 字段生成 keyHint：取尾 4 位，前缀 *** */
function toKeyHint(apiKey: string | undefined): string | null {
  const realKey = resolveApiKey(apiKey);
  if (!realKey || realKey.length < 4) return null;
  return "***" + realKey.slice(-4);
}

/** 解析 apiKey：明文直接返回，{env:XXX} 引用尝试环境变量（兼容旧配置） */
function resolveApiKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const envMatch = raw.match(/^\{env:(.+)\}$/);
  return envMatch ? (process.env[envMatch[1]] ?? null) : raw;
}

function ok(data: unknown) { return { success: true as const, data }; }
function err(code: string, message: string) { return { success: false as const, error: { code, message } }; }

function extractApiKey(cfg: ProviderConfig): string | undefined {
  return cfg.options?.apiKey as string | undefined;
}

function extractBaseURL(cfg: ProviderConfig): string | undefined {
  return cfg.options?.baseURL as string | undefined;
}

async function handleList() {
  const provider = (await getSection<Record<string, ProviderConfig>>("provider")) ?? {};
  const providers = Object.entries(provider).map(([id, cfg]) => ({
    id,
    name: cfg.name ?? id,
    npm: cfg.npm ?? null,
    configured: !!extractApiKey(cfg),
    keyHint: toKeyHint(extractApiKey(cfg)),
    baseURL: extractBaseURL(cfg) ?? null,
    modelCount: cfg.models ? Object.keys(cfg.models).length : 0,
  }));
  return ok({ providers });
}

async function handleGet(name: string) {
  const provider = (await getSection<Record<string, ProviderConfig>>("provider")) ?? {};
  const cfg = provider[name];
  if (!cfg) return err("NOT_FOUND", `Provider '${name}' not found`);
  const models = cfg.models
    ? Object.entries(cfg.models).map(([modelId, modelCfg]) => ({
        id: modelId,
        name: (modelCfg.name as string) ?? modelId,
        modalities: modelCfg.modalities ?? null,
        limit: modelCfg.limit ?? null,
        cost: modelCfg.cost ?? null,
      }))
    : [];
  return ok({
    id: name,
    name: cfg.name ?? name,
    npm: cfg.npm ?? null,
    keyHint: toKeyHint(extractApiKey(cfg)),
    baseURL: extractBaseURL(cfg) ?? null,
    options: cfg.options ?? {},
    models,
  });
}

async function handleSet(name: string, data: Record<string, unknown>) {
  if (!name || typeof name !== "string") return err("VALIDATION_ERROR", "Provider name is required");

  let keyHint: string | null = null;
  await modifySection<Record<string, ProviderConfig>>("provider", (provider) => {
    const current = provider ?? {};
    const existing = current[name] ?? {};

    const updated: ProviderConfig = {
      ...existing,
      npm: (data.npm as string) ?? existing.npm ?? "@ai-sdk/openai-compatible",
      name: (data.name as string) ?? existing.name,
      options: {
        ...(existing.options ?? {}),
        ...(data.baseURL !== undefined ? { baseURL: data.baseURL as string } : {}),
        ...(data.apiKey !== undefined ? { apiKey: data.apiKey as string } : {}),
      },
    };
    if (existing.models) updated.models = existing.models;
    if (data.models && typeof data.models === "object") {
      updated.models = data.models as Record<string, Record<string, unknown>>;
    }

    current[name] = updated;
    keyHint = toKeyHint(updated.options?.apiKey as string | undefined);
    return current;
  });
  invalidateAvailableCache();
  return ok({ id: name, keyHint });
}

async function handleTest(name: string) {
  const provider = (await getSection<Record<string, ProviderConfig>>("provider")) ?? {};
  const cfg = provider[name];
  if (!cfg) return err("NOT_FOUND", `Provider '${name}' not found`);

  const apiKey = resolveApiKey(extractApiKey(cfg)) ?? "";
  let baseURL = extractBaseURL(cfg) ?? "https://api.anthropic.com";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    // 避免双重 /v1：如果 baseURL 已以 /v1 结尾，不再追加
    const modelsPath = baseURL.endsWith("/v1") ? "/models" : "/v1/models";
    const res = await fetch(`${baseURL}${modelsPath}`, {
      headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      // 401/403 → 认证失败
      if (res.status === 401 || res.status === 403) {
        let detail = "";
        try { const body = await res.text(); detail = body.slice(0, 200); } catch {}
        return err("CONFIG_READ_ERROR", `认证失败 (HTTP ${res.status})${detail ? ": " + detail : ""}`);
      }
      // 其他错误（400、404 等）→ API 可达，只是模型列表接口不兼容
      return ok({ models: [], warning: `API 可达，但模型列表接口返回 HTTP ${res.status}` });
    }
    const json = await res.json() as { data?: Array<{ id: string }> };
    const models = (json.data ?? []).map((m) => m.id);
    return ok({ models });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Connection failed";
    return err("CONFIG_READ_ERROR", `Test failed: ${message}`);
  }
}

async function handleDelete(name: string) {
  let notFound = false;
  await modifySection<Record<string, ProviderConfig>>("provider", (provider) => {
    const current = provider ?? {};
    if (!current[name]) {
      notFound = true;
      return current;
    }
    delete current[name];
    return current;
  });
  if (notFound) return err("NOT_FOUND", `Provider '${name}' not found`);
  invalidateAvailableCache();
  return ok(null);
}

async function handleAddModel(providerName: string, data: Record<string, unknown>) {
  const modelId = data.modelId as string;
  if (!modelId) return err("VALIDATION_ERROR", "modelId is required");

  let result: "ok" | "provider_not_found" | "already_exists" = "ok" as typeof result;
  await modifySection<Record<string, ProviderConfig>>("provider", (provider) => {
    const current = provider ?? {};
    const cfg = current[providerName];
    if (!cfg) {
      result = "provider_not_found";
      return current;
    }
    if (!cfg.models) cfg.models = {};
    if (cfg.models[modelId]) {
      result = "already_exists";
      return current;
    }
    cfg.models[modelId] = buildModelData(data);
    current[providerName] = cfg;
    return current;
  });
  if (result === "provider_not_found") return err("NOT_FOUND", `Provider '${providerName}' not found`);
  if (result === "already_exists") return err("VALIDATION_ERROR", `Model '${modelId}' already exists`);
  invalidateAvailableCache();
  return ok({ modelId });
}

async function handleUpdateModel(providerName: string, modelId: string, data: Record<string, unknown>) {
  if (!modelId) return err("VALIDATION_ERROR", "modelId is required");

  let result: "ok" | "provider_not_found" | "model_not_found" = "ok" as typeof result;
  await modifySection<Record<string, ProviderConfig>>("provider", (provider) => {
    const current = provider ?? {};
    const cfg = current[providerName];
    if (!cfg) {
      result = "provider_not_found";
      return current;
    }
    if (!cfg.models || !cfg.models[modelId]) {
      result = "model_not_found";
      return current;
    }

    const existing = cfg.models[modelId] as Record<string, unknown>;
    const incoming = buildModelData(data);
    const merged: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(incoming)) {
      if (v && typeof v === "object" && !Array.isArray(v) && existing[k] && typeof existing[k] === "object" && !Array.isArray(existing[k])) {
        merged[k] = { ...(existing[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
      } else {
        merged[k] = v;
      }
    }
    cfg.models[modelId] = merged;
    current[providerName] = cfg;
    return current;
  });
  if (result === "provider_not_found") return err("NOT_FOUND", `Provider '${providerName}' not found`);
  if (result === "model_not_found") return err("NOT_FOUND", `Model '${modelId}' not found`);
  invalidateAvailableCache();
  return ok({ modelId });
}

async function handleRemoveModel(providerName: string, modelId: string) {
  if (!modelId) return err("VALIDATION_ERROR", "modelId is required");

  let result: "ok" | "provider_not_found" | "model_not_found" = "ok" as typeof result;
  await modifySection<Record<string, ProviderConfig>>("provider", (provider) => {
    const current = provider ?? {};
    const cfg = current[providerName];
    if (!cfg) {
      result = "provider_not_found";
      return current;
    }
    if (!cfg.models || !cfg.models[modelId]) {
      result = "model_not_found";
      return current;
    }
    delete cfg.models[modelId];
    current[providerName] = cfg;
    return current;
  });
  if (result === "provider_not_found") return err("NOT_FOUND", `Provider '${providerName}' not found`);
  if (result === "model_not_found") return err("NOT_FOUND", `Model '${modelId}' not found`);
  invalidateAvailableCache();
  return ok(null);
}

function buildModelData(data: Record<string, unknown>): Record<string, unknown> {
  const model: Record<string, unknown> = {};
  if (data.name) model.name = data.name;
  if (data.modalities) model.modalities = data.modalities;
  if (data.limit) model.limit = data.limit;
  if (data.cost) model.cost = data.cost;
  if (data.options) model.options = data.options;
  return model;
}

app.post("/config/providers", async ({ body, error }) => {
  const b = (body as any) ?? {};
  const payload: ProviderBody = { action: b.action ?? "", name: b.name, modelId: b.modelId, data: b.data };
  try {
    switch (payload.action) {
      case "list": return await handleList();
      case "get": return await handleGet(payload.name!);
      case "set": return await handleSet(payload.name!, payload.data!);
      case "test": return await handleTest(payload.name!);
      case "delete": return await handleDelete(payload.name!);
      case "add_model": return await handleAddModel(payload.name!, payload.data!);
      case "update_model": return await handleUpdateModel(payload.name!, payload.modelId!, payload.data!);
      case "remove_model": return await handleRemoveModel(payload.name!, payload.modelId!);
      default: return error(400, err("VALIDATION_ERROR", `Unknown action: ${payload.action}`));
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return error(500, err("CONFIG_READ_ERROR", message));
  }
}, { sessionAuth: true });

export default app;
