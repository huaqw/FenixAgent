import { Hono } from "hono";
import { sessionAuth } from "../../../auth/middleware";
import { getSection, replaceSection } from "../../../services/config";
import { inspectRemoteMcpServer } from "../../../services/mcp-inspector";
import { db } from "../../../db";
import { mcpTool } from "../../../db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// 内部类型定义（与前端 web/src/types/config.ts 对齐）
type McpLocalConfig = {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

type McpRemoteConfig = {
  type: "remote";
  url: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  oauth?: { clientId?: string; clientSecret?: string; scope?: string; redirectUri?: string } | false;
  timeout?: number;
};

type McpDisabledConfig = { enabled: false };

type McpServerConfig = McpLocalConfig | McpRemoteConfig | McpDisabledConfig;

type McpRecord = Record<string, McpServerConfig>;

// 服务器名称校验：1-64 字符，小写字母/数字/连字符
function isValidMcpName(name: string): boolean {
  return typeof name === "string"
    && name.length >= 1 && name.length <= 64
    && !/--/.test(name)
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name);
}

// 配置校验：验证 McpServerConfig 结构
function validateMcpConfig(config: unknown): string | null {
  if (typeof config !== "object" || config === null) return "INVALID_CONFIG";
  const cfg = config as Record<string, unknown>;

  // 禁用变体
  if ("enabled" in cfg && cfg.enabled === false && Object.keys(cfg).length === 1) return null;

  // 必须有 type 字段
  if (!("type" in cfg) || typeof cfg.type !== "string") return "INVALID_CONFIG_TYPE";
  const type = cfg.type as string;

  if (type === "local") {
    if (!Array.isArray(cfg.command) || cfg.command.length === 0 || !cfg.command.every((c: unknown) => typeof c === "string")) {
      return "INVALID_COMMAND";
    }
    if (cfg.environment !== undefined && (typeof cfg.environment !== "object" || cfg.environment === null)) {
      return "INVALID_ENVIRONMENT";
    }
    if (cfg.timeout !== undefined && (typeof cfg.timeout !== "number" || cfg.timeout <= 0)) {
      return "INVALID_TIMEOUT";
    }
  } else if (type === "remote") {
    if (typeof cfg.url !== "string" || cfg.url.length === 0) return "INVALID_URL";
    if (cfg.headers !== undefined && (typeof cfg.headers !== "object" || cfg.headers === null)) {
      return "INVALID_HEADERS";
    }
    if (cfg.timeout !== undefined && (typeof cfg.timeout !== "number" || cfg.timeout <= 0)) {
      return "INVALID_TIMEOUT";
    }
  } else {
    return "INVALID_CONFIG_TYPE";
  }
  return null;
}

// 从 McpServerConfig 提取列表摘要信息
function toServerInfo(name: string, config: McpServerConfig) {
  if ("enabled" in config && config.enabled === false && !("type" in config)) {
    return { name, type: "disabled" as const, enabled: false, summary: "已禁用" };
  }
  if (config.type === "local") {
    return {
      name,
      type: "local" as const,
      enabled: config.enabled !== false,
      summary: (config.command as string[])[0] ?? "",
      timeout: config.timeout,
    };
  }
  // remote
  return {
    name,
    type: "remote" as const,
    enabled: config.enabled !== false,
    summary: (config as McpRemoteConfig).url ?? "",
    timeout: (config as McpRemoteConfig).timeout,
  };
}

// --- Action Handlers ---

async function handleList() {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  const servers = Object.entries(mcp).map(([name, config]) => toServerInfo(name, config));

  // 附加 toolsCount
  const serversWithCount = await Promise.all(
    servers.map(async (s) => {
      try {
        const tools = await db.select({ id: mcpTool.id })
          .from(mcpTool)
          .where(eq(mcpTool.serverName, s.name));
        return { ...s, toolsCount: tools.length };
      } catch {
        return { ...s, toolsCount: 0 };
      }
    }),
  );

  return { success: true, data: { servers: serversWithCount } };
}

async function handleGet(name: string) {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  const config = mcp[name];
  if (!config) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };
  return { success: true, data: { name, config } };
}

async function handleCreate(name: string, config: McpServerConfig) {
  if (!isValidMcpName(name)) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid server name: must be 1-64 lowercase alphanumeric chars with single hyphens" } };
  }
  const validation = validateMcpConfig(config);
  if (validation) return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };

  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  if (mcp[name]) return { success: false, error: { code: "ALREADY_EXISTS", message: `MCP server '${name}' already exists` } };
  mcp[name] = config;
  await replaceSection("mcp", mcp);
  return { success: true, data: { name } };
}

async function handleUpdate(name: string, config: McpServerConfig) {
  const validation = validateMcpConfig(config);
  if (validation) return { success: false, error: { code: "VALIDATION_ERROR", message: validation } };

  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  if (!mcp[name]) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };
  mcp[name] = config;
  await replaceSection("mcp", mcp);
  return { success: true, data: { name } };
}

async function handleDelete(name: string) {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  if (!mcp[name]) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };
  delete mcp[name];
  await replaceSection("mcp", mcp);

  // 同时删除该服务器的 tools 缓存
  try {
    await db.delete(mcpTool).where(eq(mcpTool.serverName, name));
  } catch {
    // ignore db errors on cleanup
  }

  return { success: true };
}

async function handleEnable(name: string) {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  const config = mcp[name];
  if (!config) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };

  // 如果当前是禁用变体 { enabled: false }，无法启用（缺少原始配置信息）
  if ("enabled" in config && config.enabled === false && !("type" in config)) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: `Cannot enable '${name}': original config lost, please recreate` } };
  }
  (config as Record<string, unknown>).enabled = true;
  mcp[name] = config;
  await replaceSection("mcp", mcp);
  return { success: true, data: { name, enabled: true } };
}

async function handleDisable(name: string) {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  const config = mcp[name];
  if (!config) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };
  (config as Record<string, unknown>).enabled = false;
  mcp[name] = config;
  await replaceSection("mcp", mcp);
  return { success: true, data: { name, enabled: false } };
}

async function handleTest(name: string) {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  const config = mcp[name];
  if (!config) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };

  // remote: 使用 MCP SDK 连接
  if ("type" in config && config.type === "remote") {
    const remote = config as McpRemoteConfig;
    const timeout = remote.timeout ?? 10000;
    const headers: Record<string, string> = { ...remote.headers };
    if (remote.oauth && typeof remote.oauth === "object" && remote.oauth.clientId) {
      headers["Authorization"] = `Bearer ${remote.oauth.clientId}`;
    }
    const result = await inspectRemoteMcpServer(remote.url, headers, timeout);
    if (result.reachable && result.protocol) {
      return {
        success: true,
        data: {
          name,
          reachable: true,
          protocol: true,
          serverName: result.serverName ?? null,
          serverVersion: result.serverVersion ?? null,
          toolsCount: result.tools.length,
          transport: result.transport,
        },
      };
    }
    if (result.reachable) {
      return { success: true, data: { name, reachable: true, protocol: false, message: result.message ?? "非 MCP 协议" } };
    }
    return { success: true, data: { name, reachable: false, protocol: false, message: result.message ?? "连接失败" } };
  }

  // local: 检查命令是否可执行
  if ("type" in config && config.type === "local") {
    const cmd = (config.command as string[])[0];
    try {
      const proc = Bun.spawn(["which", cmd], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      if (proc.exitCode === 0) {
        return { success: true, data: { name, reachable: true, protocol: false, message: `命令 "${cmd}" 可用` } };
      }
      return { success: true, data: { name, reachable: false, protocol: false, message: `命令 "${cmd}" 未找到` } };
    } catch {
      return { success: true, data: { name, reachable: false, protocol: false, message: `命令 "${cmd}" 检查失败` } };
    }
  }

  return { success: false, error: { code: "VALIDATION_ERROR", message: `Cannot test '${name}': unsupported config type` } };
}

async function handleTestUrl(url: string, headers?: Record<string, string>, timeout?: number) {
  if (!url || typeof url !== "string") return { success: false, error: { code: "VALIDATION_ERROR", message: "URL is required" } };
  const ms = timeout ?? 10000;
  const result = await inspectRemoteMcpServer(url, headers, ms);
  if (result.reachable && result.protocol) {
    return {
      success: true,
      data: {
        reachable: true,
        protocol: true,
        serverName: result.serverName ?? null,
        serverVersion: result.serverVersion ?? null,
        toolsCount: result.tools.length,
        transport: result.transport,
      },
    };
  }
  if (result.reachable) {
    return { success: true, data: { reachable: true, protocol: false, message: result.message ?? "非 MCP 协议" } };
  }
  return { success: true, data: { reachable: false, protocol: false, message: result.message ?? "连接失败" } };
}

async function handleInspect(name: string) {
  const mcp = (await getSection<McpRecord>("mcp")) ?? {};
  const config = mcp[name];
  if (!config) return { success: false, error: { code: "NOT_FOUND", message: `MCP server '${name}' not found` } };

  if (!("type" in config) || config.type !== "remote") {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Inspect only supports remote MCP servers" } };
  }

  const remote = config as McpRemoteConfig;
  const timeout = remote.timeout ?? 10000;
  const headers: Record<string, string> = { ...remote.headers };
  if (remote.oauth && typeof remote.oauth === "object" && remote.oauth.clientId) {
    headers["Authorization"] = `Bearer ${remote.oauth.clientId}`;
  }

  const result = await inspectRemoteMcpServer(remote.url, headers, timeout);
  if (!result.reachable || !result.protocol) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: result.message ?? "无法连接到 MCP 服务器" } };
  }

  // 删除旧记录，插入新记录
  await db.delete(mcpTool).where(eq(mcpTool.serverName, name));
  const now = new Date();
  if (result.tools.length > 0) {
    const rows = result.tools.map((t) => ({
      id: randomUUID(),
      serverName: name,
      toolName: t.name,
      description: t.description ?? null,
      inputSchema: t.inputSchema ? JSON.stringify(t.inputSchema) : null,
      inspectedAt: now,
    }));
    await db.insert(mcpTool).values(rows);
  }

  return {
    success: true,
    data: {
      name,
      serverInfo: { name: result.serverName, version: result.serverVersion },
      tools: result.tools,
      transport: result.transport,
      stored: true,
    },
  };
}

async function handleListTools(name: string) {
  const tools = await db.select()
    .from(mcpTool)
    .where(eq(mcpTool.serverName, name));

  return {
    success: true,
    data: {
      name,
      tools: tools.map((t) => ({
        id: t.id,
        toolName: t.toolName,
        description: t.description,
        inputSchema: t.inputSchema,
        inspectedAt: t.inspectedAt.getTime(),
      })),
    },
  };
}

// --- 路由注册 ---
const app = new Hono();

app.post("/config/mcp", sessionAuth, async (c) => {
  const body = await c.req.json<{ action: string; name?: string; config?: unknown; url?: string; headers?: Record<string, string>; timeout?: number }>()
    .catch((): { action: string; name?: string; config?: unknown; url?: string; headers?: Record<string, string>; timeout?: number } => ({ action: "" }));
  const { action, name, config, url, headers, timeout } = body;

  switch (action) {
    case "list":       return c.json(await handleList());
    case "get":        return c.json(await handleGet(name!));
    case "create":     return c.json(await handleCreate(name!, config as McpServerConfig));
    case "update":     return c.json(await handleUpdate(name!, config as McpServerConfig));
    case "delete":     return c.json(await handleDelete(name!));
    case "enable":     return c.json(await handleEnable(name!));
    case "disable":    return c.json(await handleDisable(name!));
    case "test":       return c.json(await handleTest(name!));
    case "test_url":   return c.json(await handleTestUrl(url!, headers, timeout));
    case "inspect":    return c.json(await handleInspect(name!));
    case "list_tools": return c.json(await handleListTools(name!));
    default: return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: `Unknown action '${action}'` } }, 400);
  }
});

export default app;
