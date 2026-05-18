import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock fetch
const fetchMock = { status: 200, body: {} as unknown };

beforeEach(() => {
  fetchMock.status = 200;
  fetchMock.body = {};
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(fetchMock.body), {
        status: fetchMock.status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as typeof fetch;
});

describe("MCP Eden Treaty 客户端", () => {
  // 测试 MCP 服务器列表正常返回
  test("list MCP servers 正常返回", async () => {
    fetchMock.body = {
      success: true,
      data: { servers: [{ name: "my-local", type: "local", enabled: true, summary: "npx" }] },
    };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.mcp.post({ action: "list" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0].name).toBe("my-local");
  });

  // 测试 MCP 列表发送正确请求
  test("list MCP servers 发送正确请求", async () => {
    fetchMock.body = { success: true, data: { servers: [] } };
    const { client } = await import("../api/client");
    await client.web.config.mcp.post({ action: "list" } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("list");
  });

  // 测试获取 MCP 服务器详情正常返回
  test("get MCP server 正常返回", async () => {
    fetchMock.body = {
      success: true,
      data: { name: "my-local", config: { type: "local", command: ["npx", "mcp-server"] } },
    };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.mcp.post({ action: "get", name: "my-local" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.config.type).toBe("local");
  });

  // 测试获取 MCP 服务器发送正确 payload
  test("get MCP server 发送正确 payload", async () => {
    fetchMock.body = { success: true, data: { name: "test", config: { type: "local", command: ["npx"] } } };
    const { client } = await import("../api/client");
    await client.web.config.mcp.post({ action: "get", name: "test-server" } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("get");
    expect(body.name).toBe("test-server");
  });

  // 测试创建 MCP 服务器正常返回
  test("create MCP server 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "new-server" } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.mcp.post({
      action: "create",
      name: "new-server",
      config: { type: "local", command: ["npx"] },
    } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.name).toBe("new-server");
  });

  // 测试创建 MCP 服务器发送正确 payload
  test("create MCP server 发送正确 payload", async () => {
    fetchMock.body = { success: true, data: { name: "new-server" } };
    const { client } = await import("../api/client");
    const config = { type: "local" as const, command: ["npx", "mcp-server"] };
    await client.web.config.mcp.post({ action: "create", name: "new-server", config } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("create");
    expect(body.name).toBe("new-server");
    expect(body.config.type).toBe("local");
  });

  // 测试更新 MCP 服务器发送正确 payload
  test("update MCP server 发送正确 payload", async () => {
    fetchMock.body = { success: true, data: { name: "my-local" } };
    const { client } = await import("../api/client");
    const config = { type: "local" as const, command: ["npx", "updated"] };
    await client.web.config.mcp.post({ action: "update", name: "my-local", config } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("update");
    expect(body.name).toBe("my-local");
    expect(body.config.command).toEqual(["npx", "updated"]);
  });

  // 测试删除 MCP 服务器发送 delete action
  test("delete MCP server 发送 delete action", async () => {
    fetchMock.body = { success: true, data: null };
    const { client } = await import("../api/client");
    await client.web.config.mcp.post({ action: "delete", name: "test-srv" } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("delete");
    expect(body.name).toBe("test-srv");
  });

  // 测试启用 MCP 服务器正常返回
  test("enable MCP server 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "s1", enabled: true } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.mcp.post({ action: "enable", name: "s1" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.enabled).toBe(true);
  });

  // 测试禁用 MCP 服务器正常返回
  test("disable MCP server 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "s1", enabled: false } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.mcp.post({ action: "disable", name: "s1" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.enabled).toBe(false);
  });

  // 测试错误响应返回 error
  test("错误响应返回 error", async () => {
    fetchMock.status = 404;
    fetchMock.body = { error: { code: "NOT_FOUND", message: "Server not found" } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.mcp.post({ action: "get", name: "xxx" } as any);
    expect(error).not.toBeNull();
  });
});
