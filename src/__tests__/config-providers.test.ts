import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";

// Mutable provider store for mocking
let _providerStore: Record<string, unknown> = {};

// Must mock modules BEFORE importing the route
// Paths are relative to this test file at src/__tests__/
mock.module("../auth/middleware", () => ({
  sessionAuth: async (c: any, next: any) => {
    c.set("user", { id: "test-user", email: "test@test.com", name: "Test" });
    await next();
  },
}));

mock.module("../services/config", () => ({
  getSection: async (_section: string) => _section === "provider" ? _providerStore : undefined,
  setSection: async (_section: string, data: unknown) => { _providerStore = data as Record<string, unknown>; },
  deleteSection: async () => false,
  setTopLevelField: async () => {},
  getConfig: async () => ({ provider: _providerStore }),
}));

// Import AFTER mocks
const providersRoute = (await import("../routes/web/config/providers")).default;

describe("Providers Config Route", () => {
  beforeEach(() => {
    _providerStore = {};
  });

  afterEach(() => {
    // Clean up any env vars set during tests
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("RCS_SECRET_")) delete process.env[key];
    }
  });

  test("list action — 空配置", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.providers).toEqual([]);
  });

  test("list action — 有配置", async () => {
    _providerStore = {
      anthropic: { apiKey: "sk-ant-1234567890", baseURL: "https://api.anthropic.com" },
      openai: { apiKey: "sk-open-abcdef", baseURL: "https://api.openai.com" },
    };
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.providers).toHaveLength(2);
    expect(json.data.providers[0].name).toBe("anthropic");
    expect(json.data.providers[0].configured).toBe(true);
    expect(json.data.providers[0].keyHint).toBe("***7890");
  });

  test("get action — 存在", async () => {
    _providerStore = { anthropic: { apiKey: "sk-ant-1234", baseURL: "https://api.anthropic.com" } };
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", name: "anthropic" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("anthropic");
    expect(json.data.keyHint).toBe("***1234");
  });

  test("get action — 不存在", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", name: "unknown" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  test("set action — 创建新 provider", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", name: "ollama", data: { apiKey: "sk-test", baseURL: "http://localhost:11434" } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("ollama");
    // API Key should be stored as env reference
    expect(_providerStore.ollama.apiKey).toBe("{env:RCS_SECRET_OLLAMA}");
    // The env var should be set
    expect(process.env.RCS_SECRET_OLLAMA).toBe("sk-test");
  });

  test("set action — 更新已有 provider", async () => {
    _providerStore = { anthropic: { apiKey: "old", baseURL: "https://api.anthropic.com" } };
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", name: "anthropic", data: { baseURL: "https://new.api.com" } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(_providerStore.anthropic).toBeDefined();
  });

  test("set action — 缺少 name 返回 VALIDATION_ERROR", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", data: { apiKey: "x" } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  test("delete action — 存在", async () => {
    _providerStore = { anthropic: { apiKey: "x" }, openai: { apiKey: "y" } };
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", name: "anthropic" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect("anthropic" in _providerStore).toBe(false);
    expect("openai" in _providerStore).toBe(true);
  });

  test("delete action — 不存在", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", name: "ghost" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  test("test action — 连接成功", async () => {
    _providerStore = {
      anthropic: { apiKey: "test-key", baseURL: "https://api.example.com" },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "model-a" }, { id: "model-b" }] }),
    } as Response) as any;

    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", name: "anthropic" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.models).toEqual(["model-a", "model-b"]);

    globalThis.fetch = originalFetch;
  });

  test("test action — 连接失败", async () => {
    _providerStore = {
      anthropic: { apiKey: "bad-key", baseURL: "https://api.example.com" },
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Network error"); };

    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", name: "anthropic" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("CONFIG_READ_ERROR");

    globalThis.fetch = originalFetch;
  });

  test("test action — provider 不存在", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", name: "nonexistent" }),
    }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  test("未知 action 返回 VALIDATION_ERROR", async () => {
    const res = await providersRoute.request(new Request("http://localhost/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid" }),
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
