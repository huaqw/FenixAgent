import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock fetch
const fetchMock = { status: 200, body: {} as unknown };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.status = 200;
  fetchMock.body = {};
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify(fetchMock.body), { status: fetchMock.status, headers: { "Content-Type": "application/json" } }))
  ) as typeof fetch;
});

describe("MCP API 客户端", () => {
  test("apiListMcpServers 正常返回", async () => {
    fetchMock.body = { success: true, data: { servers: [{ name: "my-local", type: "local", enabled: true, summary: "npx" }] } };
    const { apiListMcpServers } = await import("../api/client");
    const result = await apiListMcpServers();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-local");
  });

  test("apiListMcpServers 发送正确请求", async () => {
    fetchMock.body = { success: true, data: { servers: [] } };
    const { apiListMcpServers } = await import("../api/client");
    await apiListMcpServers();
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    expect(call[0]).toBe("/web/config/mcp");
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("list");
  });

  test("apiGetMcpServer 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "my-local", config: { type: "local", command: ["npx", "mcp-server"] } } };
    const { apiGetMcpServer } = await import("../api/client");
    const result = await apiGetMcpServer("my-local");
    expect(result.config.type).toBe("local");
  });

  test("apiGetMcpServer 发送正确 payload", async () => {
    fetchMock.body = { success: true, data: { name: "test", config: { type: "local", command: ["npx"] } } };
    const { apiGetMcpServer } = await import("../api/client");
    await apiGetMcpServer("test-server");
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("get");
    expect(body.name).toBe("test-server");
  });

  test("apiCreateMcpServer 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "new-server" } };
    const { apiCreateMcpServer } = await import("../api/client");
    const result = await apiCreateMcpServer("new-server", { type: "local", command: ["npx"] });
    expect(result.name).toBe("new-server");
  });

  test("apiCreateMcpServer 发送正确 payload", async () => {
    fetchMock.body = { success: true, data: { name: "new-server" } };
    const { apiCreateMcpServer } = await import("../api/client");
    const config = { type: "local" as const, command: ["npx", "mcp-server"] };
    await apiCreateMcpServer("new-server", config);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("create");
    expect(body.name).toBe("new-server");
    expect(body.config.type).toBe("local");
  });

  test("apiUpdateMcpServer 发送正确 payload", async () => {
    fetchMock.body = { success: true, data: { name: "my-local" } };
    const { apiUpdateMcpServer } = await import("../api/client");
    const config = { type: "local" as const, command: ["npx", "updated"] };
    await apiUpdateMcpServer("my-local", config);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("update");
    expect(body.name).toBe("my-local");
    expect(body.config.command).toEqual(["npx", "updated"]);
  });

  test("apiDeleteMcpServer 发送 delete action", async () => {
    fetchMock.body = { success: true, data: null };
    const { apiDeleteMcpServer } = await import("../api/client");
    await apiDeleteMcpServer("test-srv");
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("delete");
    expect(body.name).toBe("test-srv");
  });

  test("apiEnableMcpServer 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "s1", enabled: true } };
    const { apiEnableMcpServer } = await import("../api/client");
    const result = await apiEnableMcpServer("s1");
    expect(result.enabled).toBe(true);
  });

  test("apiDisableMcpServer 正常返回", async () => {
    fetchMock.body = { success: true, data: { name: "s1", enabled: false } };
    const { apiDisableMcpServer } = await import("../api/client");
    const result = await apiDisableMcpServer("s1");
    expect(result.enabled).toBe(false);
  });

  test("错误响应抛出异常", async () => {
    fetchMock.body = { success: false, error: { code: "NOT_FOUND", message: "Server not found" } };
    const { apiGetMcpServer } = await import("../api/client");
    expect(apiGetMcpServer("xxx")).rejects.toThrow("Server not found");
  });
});
