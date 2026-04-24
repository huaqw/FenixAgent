import { describe, test, expect, beforeEach, mock } from "bun:test";

let _configStore: Record<string, unknown> = {};

mock.module("../auth/middleware", () => ({
  sessionAuth: async (c: any, next: any) => {
    c.set("user", { id: "test-user", email: "test@test.com", name: "Test" });
    await next();
  },
}));

mock.module("../services/config", () => ({
  getConfig: async () => _configStore,
  setTopLevelField: async (field: string, value: unknown) => { _configStore[field] = value; },
}));

const modelsRoute = (await import("../routes/web/config/models")).default;

describe("Models Config Route", () => {
  beforeEach(() => {
    _configStore = {};
  });

  test("get action — 无配置", async () => {
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.current).toEqual({ model: null, small_model: null });
    expect(json.data.available).toEqual([]);
  });

  test("get action — 有配置", async () => {
    _configStore = {
      model: "claude-sonnet-4-6",
      small_model: "claude-haiku-4-5",
      provider: {
        anthropic: {
          models: {
            "claude-sonnet-4-6": { name: "Claude Sonnet 4.6" },
            "claude-haiku-4-5": { name: "Claude Haiku 4.5" },
          },
        },
      },
    };
    // Force cache refresh to pick up new config
    await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    }));
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.current.model).toBe("claude-sonnet-4-6");
    expect(json.data.current.small_model).toBe("claude-haiku-4-5");
    expect(json.data.available).toHaveLength(2);
    expect(json.data.available[0]).toMatchObject({ id: "claude-sonnet-4-6", provider: "anthropic", label: "Claude Sonnet 4.6" });
  });

  test("get action — 使用缓存", async () => {
    _configStore = {
      model: "a",
      provider: { test: { models: { "model-1": { name: "M1" } } } },
    };
    // Force refresh to build cache with this config
    await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    }));
    // Now call get — should use cache (not refresh)
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get" }),
    }));
    // Modify store after first request
    _configStore.provider = {};
    // Second request — should use cache (still see old data)
    const res2 = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get" }),
    }));
    const json = await res.json();
    const json2 = await res2.json();
    // Cache still has old provider data
    expect(json2.data.available).toHaveLength(1);
  });

  test("set action — 设置主模型", async () => {
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", data: { model: "claude-opus-4-7" } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.model).toBe("claude-opus-4-7");
    expect(_configStore.model).toBe("claude-opus-4-7");
  });

  test("set action — 设置轻量模型", async () => {
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", data: { small_model: "gpt-4o-mini" } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.small_model).toBe("gpt-4o-mini");
    expect(_configStore.small_model).toBe("gpt-4o-mini");
  });

  test("set action — 同时设置", async () => {
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", data: { model: "a", small_model: "b" } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(_configStore.model).toBe("a");
    expect(_configStore.small_model).toBe("b");
  });

  test("set action — 空数据返回 VALIDATION_ERROR", async () => {
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", data: {} }),
    }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  test("refresh action", async () => {
    _configStore = {
      provider: {
        p1: { models: { m1: { name: "M1" }, m2: { name: "M2" } } },
      },
    };
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(2);
  });

  test("未知 action 返回 VALIDATION_ERROR", async () => {
    const res = await modelsRoute.request(new Request("http://localhost/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid" }),
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
