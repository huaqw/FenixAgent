// ── updateMcpServer 返回 boolean（与 deleteMcpServer/setMcpServerEnabled 对齐） ──
import { describe, test, expect, mock } from "bun:test";

const updateResults: Array<{ returning: () => unknown[] }> = [];

mock.module("../db", () => ({
  db: {
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => updateResults.shift()?.returning() ?? []),
        })),
      })),
    })),
  },
}));
mock.module("../db/schema", () => ({
  mcpServer: {
    userId: "userId",
    name: "name",
    id: "id",
    config: "config",
    type: "type",
    enabled: "enabled",
    updatedAt: "updatedAt",
  },
  mcpTool: {},
}));
mock.module("drizzle-orm", () => ({
  eq: mock((_: unknown, v: unknown) => v),
  and: mock((...args: unknown[]) => args),
  sql: mock((strings: TemplateStringsArray) => strings.join("")),
}));
mock.module("../services/config/jsonb", () => ({
  parseJsonb: mock((v: unknown) => v),
}));

const { updateMcpServer } = await import("../services/config/mcp-server");

describe("updateMcpServer returns boolean", () => {
  // 存在的 MCP server 返回 true
  test("returns true when server exists", async () => {
    updateResults.push({ returning: () => [{ id: "mcp-1" }] });
    const result = await updateMcpServer("user-1", "github", { type: "remote", url: "https://api.github.com" });
    expect(result).toBe(true);
  });

  // 不存在的 MCP server 返回 false
  test("returns false when server does not exist", async () => {
    updateResults.push({ returning: () => [] });
    const result = await updateMcpServer("user-1", "nonexistent", { type: "remote", url: "https://example.com" });
    expect(result).toBe(false);
  });
});
