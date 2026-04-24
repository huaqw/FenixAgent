import { Hono } from "hono";
import { sessionAuth } from "../../../auth/middleware";
import { getSection, setSection } from "../../../services/config";

type ProviderConfig = Record<string, unknown> & { apiKey?: string; baseURL?: string; options?: { apiKey?: string; baseURL?: string } };
type ProviderBody = { action: string; name?: string; data?: Record<string, unknown> };

const app = new Hono();

/** 从 apiKey 字段生成 keyHint：取尾 4 位，前缀 *** */
function toKeyHint(apiKey: string | undefined): string | null {
  if (!apiKey) return null;
  // 如果是 {env:VAR} 格式，从环境变量取实际值
  const envMatch = apiKey.match(/^\{env:(.+)\}$/);
  const realKey = envMatch ? process.env[envMatch[1]] : apiKey;
  if (!realKey || realKey.length < 4) return null;
  return "***" + realKey.slice(-4);
}

/** 构造标准成功响应 */
function ok(data: unknown) { return { success: true as const, data }; }

/** 构造标准错误响应 */
function err(code: string, message: string) { return { success: false as const, error: { code, message } }; }

/** Extract apiKey from provider config (top-level or under options) */
function extractApiKey(cfg: ProviderConfig): string | undefined {
  return (cfg.apiKey as string) ?? (cfg.options?.apiKey as string);
}

/** Extract baseURL from provider config */
function extractBaseURL(cfg: ProviderConfig): string {
  return (cfg.baseURL as string) ?? (cfg.options?.baseURL as string) ?? "默认";
}

async function handleList() {
  const provider = (await getSection<Record<string, ProviderConfig>>("provider")) ?? {};
  const providers = Object.entries(provider).map(([name, cfg]) => ({
    name,
    configured: !!extractApiKey(cfg),
    keyHint: toKeyHint(extractApiKey(cfg)),
    baseURL: extractBaseURL(cfg),
  }));
  return ok({ providers });
}

async function handleGet(name: string) {
  const provider = (await getSection<Record<string, ProviderConfig>>("provider")) ?? {};
  const cfg = provider[name];
  if (!cfg) return err("NOT_FOUND", `Provider '${name}' not found`);
  return ok({
    name,
    ...cfg,
    keyHint: toKeyHint(extractApiKey(cfg)),
  });
}

async function handleSet(name: string, data: Record<string, unknown>) {
  if (!name || typeof name !== "string") return err("VALIDATION_ERROR", "Provider name is required");

  // API Key 安全处理：明文 → 环境变量引用
  const envVarName = `RCS_SECRET_${name.toUpperCase().replace(/-/g, "_")}`;
  if (data.apiKey && typeof data.apiKey === "string" && !data.apiKey.startsWith("{env:")) {
    process.env[envVarName] = data.apiKey as string;
    data = { ...data, apiKey: `{env:${envVarName}}` };
  }

  const provider = (await getSection<Record<string, unknown>>("provider")) ?? {};
  provider[name] = data;
  await setSection("provider", provider);
  return ok({ name, keyHint: toKeyHint(data.apiKey as string) });
}

async function handleTest(name: string) {
  const provider = (await getSection<Record<string, ProviderConfig>>("provider")) ?? {};
  const cfg = provider[name];
  if (!cfg) return err("NOT_FOUND", `Provider '${name}' not found`);

  const apiKeyRaw = extractApiKey(cfg) ?? "";
  const envMatch = apiKeyRaw.match(/^\{env:(.+)\}$/);
  const apiKey = envMatch ? process.env[envMatch[1]] ?? "" : apiKeyRaw;
  const baseURL = extractBaseURL(cfg) === "默认" ? "https://api.anthropic.com" : extractBaseURL(cfg);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${baseURL}/v1/models`, {
      headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return err("CONFIG_READ_ERROR", `Provider returned ${res.status}`);
    const json = await res.json() as { data?: Array<{ id: string }> };
    const models = (json.data ?? []).map((m) => m.id);
    return ok({ models });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Connection failed";
    return err("CONFIG_READ_ERROR", `Test failed: ${message}`);
  }
}

async function handleDelete(name: string) {
  const provider = (await getSection<Record<string, unknown>>("provider")) ?? {};
  if (!provider[name]) return err("NOT_FOUND", `Provider '${name}' not found`);
  delete provider[name];
  await setSection("provider", provider);
  return ok(null);
}

app.post("/config/providers", sessionAuth, async (c) => {
  const body = await c.req.json<ProviderBody>().catch((): ProviderBody => ({ action: "" }));
  try {
    switch (body.action) {
      case "list": return c.json(await handleList());
      case "get": return c.json(await handleGet(body.name!));
      case "set": return c.json(await handleSet(body.name!, body.data!));
      case "test": return c.json(await handleTest(body.name!));
      case "delete": return c.json(await handleDelete(body.name!));
      default: return c.json(err("VALIDATION_ERROR", `Unknown action: ${body.action}`), 400);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return c.json(err("CONFIG_READ_ERROR", message), 500);
  }
});

export default app;
