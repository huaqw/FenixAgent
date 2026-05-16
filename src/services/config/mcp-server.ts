import { db } from "../../db";
import { mcpServer, mcpTool } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// ────────────────────────────────────────────
// MCP Server 操作
// ────────────────────────────────────────────

export async function listMcpServers(userId: string) {
  return db.select().from(mcpServer)
    .where(eq(mcpServer.userId, userId));
}

export async function getMcpServer(userId: string, name: string) {
  const rows = await db.select().from(mcpServer)
    .where(and(eq(mcpServer.userId, userId), eq(mcpServer.name, name)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createMcpServer(
  userId: string,
  name: string,
  type: string,
  config: Record<string, unknown>,
) {
  await db.insert(mcpServer).values({
    userId,
    name,
    type,
    config: JSON.stringify(config),
  });
}

export async function updateMcpServer(
  userId: string,
  name: string,
  config: Record<string, unknown>,
) {
  await db.update(mcpServer)
    .set({ config: JSON.stringify(config), updatedAt: new Date() })
    .where(and(eq(mcpServer.userId, userId), eq(mcpServer.name, name)));
}

export async function deleteMcpServer(userId: string, name: string): Promise<boolean> {
  const result = await db.delete(mcpServer)
    .where(and(eq(mcpServer.userId, userId), eq(mcpServer.name, name)))
    .returning({ id: mcpServer.id });
  return result.length > 0;
}

export async function setMcpServerEnabled(userId: string, name: string, enabled: boolean) {
  await db.update(mcpServer)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(mcpServer.userId, userId), eq(mcpServer.name, name)));
}

// ────────────────────────────────────────────
// MCP Tool 缓存操作（mcp_tool 表）
// ────────────────────────────────────────────

/** 统计指定 server 的 tool 数量 */
export async function countToolsByServer(serverName: string): Promise<number> {
  const rows = await db.select({ id: mcpTool.id })
    .from(mcpTool)
    .where(eq(mcpTool.serverName, serverName));
  return rows.length;
}

/** 删除指定 server 的所有缓存 tool */
export async function deleteToolsByServer(serverName: string): Promise<void> {
  await db.delete(mcpTool).where(eq(mcpTool.serverName, serverName));
}

/** 替换指定 server 的缓存 tool（先删后插） */
export async function replaceToolsForServer(
  serverName: string,
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>,
): Promise<void> {
  await deleteToolsByServer(serverName);
  if (tools.length > 0) {
    const now = new Date();
    const rows = tools.map((t) => ({
      id: randomUUID(),
      serverName,
      toolName: t.name,
      description: t.description ?? null,
      inputSchema: t.inputSchema ? JSON.stringify(t.inputSchema) : null,
      inspectedAt: now,
    }));
    await db.insert(mcpTool).values(rows);
  }
}

/** 列出指定 server 的缓存 tool */
export async function listToolsByServer(serverName: string) {
  return db.select()
    .from(mcpTool)
    .where(eq(mcpTool.serverName, serverName));
}
