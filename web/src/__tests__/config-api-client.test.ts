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

describe("config Eden Treaty client", () => {
  // 测试 providers 列表返回正确数据
  test("list providers returns providers array", async () => {
    fetchMock.body = {
      success: true,
      data: { providers: [{ name: "openai", configured: true, keyHint: "sk-...abc", baseURL: "" }] },
    };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.providers.post({ action: "list" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].name).toBe("openai");
  });

  // 测试 set provider 发送正确 payload
  test("set provider sends correct payload", async () => {
    fetchMock.body = { success: true, data: { name: "openai", keyHint: "sk-...abc" } };
    const { client } = await import("../api/client");
    await client.web.config.providers.post({ action: "set", name: "openai", data: { apiKey: "sk-test" } } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("set");
    expect(body.name).toBe("openai");
    expect(body.data).toEqual({ apiKey: "sk-test" });
  });

  // 测试 test provider 返回模型列表
  test("test provider returns models", async () => {
    fetchMock.body = { success: true, data: { models: ["gpt-4", "gpt-3.5"] } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.providers.post({ action: "test", name: "openai" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.models).toEqual(["gpt-4", "gpt-3.5"]);
  });

  // 测试 get models 返回 ModelConfig
  test("get models returns ModelConfig", async () => {
    fetchMock.body = { success: true, data: { current: { model: "gpt-4", small_model: null }, available: [] } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.models.post({ action: "get" } as any);
    expect(error).toBeNull();
    const result = (data as any)?.data ?? data;
    expect(result.current.model).toBe("gpt-4");
  });

  // 测试 create agent 发送 create action
  test("create agent sends create action", async () => {
    fetchMock.body = { success: true, data: { name: "my-agent" } };
    const { client } = await import("../api/client");
    await client.web.config.agents.post({ action: "create", name: "my-agent", data: { model: "gpt-4" } } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("create");
  });

  // 测试 delete skill 发送 delete action
  test("delete skill sends delete action", async () => {
    fetchMock.body = { success: true, data: null };
    const { client } = await import("../api/client");
    await client.web.config.skills.post({ action: "delete", name: "my-skill" } as any);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.action).toBe("delete");
  });

  // 测试非 200 状态码返回 error
  test("non-200 response returns error", async () => {
    fetchMock.status = 404;
    fetchMock.body = { error: { code: "NOT_FOUND", message: "Not found" } };
    const { client } = await import("../api/client");
    const { data, error } = await client.web.config.providers.post({ action: "get", name: "xxx" } as any);
    expect(error).not.toBeNull();
  });

  // 测试 upload skills 使用 FormData
  test("upload skills uses FormData via fetchUpload", async () => {
    fetchMock.body = { success: true, data: { imported: [], skipped: [], conflicts: [] } };
    const { fetchUpload } = await import("../api/client");
    const formData = new FormData();
    formData.append("manifest", "[]");
    await fetchUpload("/web/config/skills/upload", formData);
    const call = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0];
    expect(call[0]).toBe("/web/config/skills/upload");
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBe(formData);
    expect(call[1].headers).toBeUndefined();
  });

  // 测试 upload skills 409 错误保留 code 和 data
  test("upload skills 409 error preserves code and data", async () => {
    fetchMock.status = 409;
    fetchMock.body = {
      success: false,
      error: { code: "SKILL_CONFLICT", message: "检测到同名技能冲突" },
      data: {
        conflicts: [{ name: "existing", enabled: true, path: "/tmp/existing/SKILL.md" }],
        allowedStrategies: ["ignore", "overwrite"],
      },
    };
    const { fetchUpload } = await import("../api/client");
    const formData = new FormData();
    formData.append("manifest", "[]");
    try {
      await fetchUpload("/web/config/skills/upload", formData);
      throw new Error("expected fetchUpload to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const uploadError = error as Error & {
        code?: string;
        data?: { conflicts: unknown[]; allowedStrategies: string[] };
      };
      expect(uploadError.code).toBe("SKILL_CONFLICT");
      expect(uploadError.data?.conflicts).toHaveLength(1);
      expect(uploadError.data?.allowedStrategies).toEqual(["ignore", "overwrite"]);
    }
  });
});
