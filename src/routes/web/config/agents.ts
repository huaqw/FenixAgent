import { Hono } from "hono";
import { sessionAuth } from "../../../auth/middleware";
import { getSection, setTopLevelField, getConfig, modifySection } from "../../../services/config";

const BUILT_IN_AGENTS = new Set(["build", "plan", "general", "explore", "title", "summary", "compaction"]);

// ── Permission 类型定义 ──
type PermissionAction = "ask" | "allow" | "deny";
type RuleBasedPermission = PermissionAction | Record<string, PermissionAction>;
type TogglePermission = PermissionAction;

type PermissionObjectConfig = {
  read?: RuleBasedPermission;
  edit?: RuleBasedPermission;
  glob?: RuleBasedPermission;
  grep?: RuleBasedPermission;
  list?: RuleBasedPermission;
  bash?: RuleBasedPermission;
  task?: RuleBasedPermission;
  external_directory?: RuleBasedPermission;
  lsp?: RuleBasedPermission;
  skill?: RuleBasedPermission;
  todowrite?: TogglePermission;
  question?: TogglePermission;
  webfetch?: TogglePermission;
  websearch?: TogglePermission;
  codesearch?: TogglePermission;
  doom_loop?: TogglePermission;
};

type PermissionConfig = PermissionAction | PermissionObjectConfig;

const AGENT_SETTABLE_FIELDS = new Set([
  "model", "prompt", "steps", "mode", "permission",
  "variant", "temperature", "top_p", "disable", "hidden", "color", "description",
]);

function isValidAgentName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)
      && name.length >= 1 && name.length <= 64
      && !name.includes("--");
}

function isValidMode(mode: string): boolean {
  return ["primary", "subagent", "all"].includes(mode);
}

function isValidSteps(steps: number): boolean {
  return Number.isInteger(steps) && steps >= 1 && steps <= 200;
}

/** 将旧 tools 格式转换为 permission 格式 */
function toolsToPermission(tools: Record<string, boolean>): PermissionObjectConfig {
  const result: Record<string, PermissionAction> = {};
  for (const [key, val] of Object.entries(tools)) {
    result[key] = val ? "allow" : "deny";
  }
  return result as PermissionObjectConfig;
}

function validateAgentData(data: Record<string, unknown>): string | null {
  if (data.mode !== undefined && !isValidMode(data.mode as string)) return "INVALID_MODE";
  if (data.steps !== undefined && !isValidSteps(data.steps as number)) return "INVALID_STEPS";
  if (data.temperature !== undefined) {
    const t = data.temperature as number;
    if (typeof t !== "number" || t < 0 || t > 2) return "INVALID_TEMPERATURE";
  }
  if (data.top_p !== undefined) {
    const p = data.top_p as number;
    if (typeof p !== "number" || p < 0 || p > 1) return "INVALID_TOP_P";
  }
  if (data.color !== undefined) {
    const c = data.color as string;
    const PRESET_COLORS = ["primary", "secondary", "accent", "success", "warning", "error", "info"];
    const isHex = /^#[0-9a-fA-F]{6}$/.test(c);
    if (typeof c !== "string" || (!isHex && !PRESET_COLORS.includes(c))) return "INVALID_COLOR";
  }
  return null;
}

async function handleList() {
  const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
  const config = await getConfig();
  const defaultAgent = config.default_agent as string | undefined;
  const list = Object.entries(agents).map(([name, cfg]) => ({
    name,
    builtIn: BUILT_IN_AGENTS.has(name),
    model: cfg.model ?? null,
    mode: cfg.mode ?? null,
    description: cfg.description ?? null,
    color: cfg.color ?? null,
  }));
  return { success: true, data: { default_agent: defaultAgent ?? null, agents: list } };
}

async function handleGet(name: string) {
  const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
  const agent = agents[name];
  if (!agent) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };

  // tools → permission 兼容转换：有 tools 无 permission 时自动转换
  let permission = agent.permission ?? null;
  if (agent.tools && !agent.permission) {
    const tools = typeof agent.tools === "object" && agent.tools !== null ? agent.tools as Record<string, boolean> : {};
    permission = toolsToPermission(tools);
  }

  return {
    success: true,
    data: {
      name,
      builtIn: BUILT_IN_AGENTS.has(name),
      model: agent.model ?? null,
      prompt: agent.prompt ?? null,
      steps: agent.steps ?? null,
      mode: agent.mode ?? null,
      permission,
      variant: agent.variant ?? null,
      temperature: agent.temperature ?? null,
      top_p: agent.top_p ?? null,
      disable: agent.disable ?? false,
      hidden: agent.hidden ?? false,
      color: agent.color ?? null,
      description: agent.description ?? null,
    },
  };
}

async function handleSet(name: string, data: Record<string, unknown>) {
  const validation = validateAgentData(data);
  if (validation) return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };

  // 白名单过滤：只写入允许的字段
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (AGENT_SETTABLE_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }

  let notFound = false;
  await modifySection<Record<string, Record<string, unknown>>>("agent", (agents) => {
    const current = agents ?? {};
    if (!current[name]) {
      notFound = true;
      return current;
    }
    const agent = { ...current[name] };
    // 写入时清除 tools 字段，始终用 permission
    delete agent.tools;
    // 逐字段合并：permission 为 null 时删除 key（清除权限），其余正常覆盖
    for (const [key, value] of Object.entries(filtered)) {
      if (key === "permission" && value == null) {
        delete agent.permission;
      } else {
        agent[key] = value;
      }
    }
    current[name] = agent;
    return current;
  });

  if (notFound) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
  return { success: true, data: { name, ...filtered } };
}

async function handleCreate(name: string, data: Record<string, unknown>) {
  if (!isValidAgentName(name)) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid agent name: must be 1-64 lowercase alphanumeric chars with single hyphens" } };
  }
  const validation = validateAgentData(data);
  if (validation) return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };

  // 白名单过滤
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (AGENT_SETTABLE_FIELDS.has(key)) {
      filtered[key] = value;
    }
  }

  let alreadyExists = false;
  await modifySection<Record<string, Record<string, unknown>>>("agent", (agents) => {
    const current = agents ?? {};
    if (current[name]) {
      alreadyExists = true;
      return current;
    }
    current[name] = filtered;
    return current;
  });
  if (alreadyExists) return { success: false, error: { code: "ALREADY_EXISTS", message: `Agent '${name}' already exists` } };
  return { success: true, data: { name } };
}

async function handleDelete(name: string) {
  if (BUILT_IN_AGENTS.has(name)) {
    return { success: false, error: { code: "FORBIDDEN", message: `Cannot delete built-in agent '${name}'` } };
  }
  let notFound = false;
  await modifySection<Record<string, Record<string, unknown>>>("agent", (agents) => {
    const current = agents ?? {};
    if (!current[name]) {
      notFound = true;
      return current;
    }
    delete current[name];
    return current;
  });
  if (notFound) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
  return { success: true };
}

async function handleSetDefault(name: string) {
  const agents = (await getSection<Record<string, Record<string, unknown>>>("agent")) ?? {};
  if (!agents[name]) return { success: false, error: { code: "NOT_FOUND", message: `Agent '${name}' not found` } };
  await setTopLevelField("default_agent", name);
  return { success: true, data: { default_agent: name } };
}

const app = new Hono();

app.post("/config/agents", sessionAuth, async (c) => {
  const body = await c.req.json<{ action: string; name?: string; data?: Record<string, unknown> }>().catch((): { action: string; name?: string; data?: Record<string, unknown> } => ({ action: "" }));
  const { action, name, data } = body;

  switch (action) {
    case "list": return c.json(await handleList());
    case "get": return c.json(await handleGet(name!));
    case "set": return c.json(await handleSet(name!, data!));
    case "create": return c.json(await handleCreate(name!, data!));
    case "delete": return c.json(await handleDelete(name!));
    case "set_default": return c.json(await handleSetDefault(name!));
    default: return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action '${action}'` } }, 400);
  }
});

export default app;
