import { describe, test, expect, beforeEach, mock } from "bun:test";

let _agentStore: Record<string, any> = {};
let _topLevelFields: Record<string, any> = {};

mock.module("../auth/better-auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "test-user", email: "test@test.com", name: "Test" },
        session: { id: "sess_test", userId: "test-user", token: "tok" },
      }),
      signUpEmail: async () => ({}),
    },
  },
}));

mock.module("../services/config", () => ({
  getSection: async (section: string) => section === "agent" ? _agentStore : undefined,
  setSection: async (_section: string, data: unknown) => { _agentStore = data as Record<string, unknown>; },
  replaceSection: async (_section: string, data: unknown) => { _agentStore = data as Record<string, unknown>; },
  modifySection: async (_section: string, modifier: (current: any) => any) => {
    const current = _section === "agent" ? _agentStore : undefined;
    _agentStore = modifier(current);
  },
  setTopLevelField: async (field: string, value: unknown) => { _topLevelFields[field] = value; },
  getConfig: async () => ({ ..._topLevelFields, agent: _agentStore }),
}));

const agentsRoute = (await import("../routes/web/config/agents")).default;

describe("Permission 更新流程验证", () => {
  beforeEach(() => {
    _agentStore = {
      demo: {
        model: "qwen",
        permission: { bash: "allow", task: "deny", skill: { "find-skills": "allow" } },
      },
    };
    _topLevelFields = {};
  });

  test("更新嵌套 permission（含 skill 规则）", async () => {
    const res = await agentsRoute.handle(new Request("http://localhost/web/config/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", name: "demo", data: { permission: { bash: "deny", task: "deny", skill: { "find-skills": "deny" } } } }),
    }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(_agentStore.demo.permission).toEqual({ bash: "deny", task: "deny", skill: { "find-skills": "deny" } });
  });

  test("GET 返回更新后的 permission", async () => {
    await agentsRoute.handle(new Request("http://localhost/web/config/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", name: "demo", data: { permission: { read: { "*.env": "deny" }, bash: "ask" } } }),
    }));
    const getRes = await agentsRoute.handle(new Request("http://localhost/web/config/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", name: "demo" }),
    }));
    const getJson = await getRes.json();
    expect(getJson.data.permission).toEqual({ read: { "*.env": "deny" }, bash: "ask" });
  });

  test("不发送 permission 时旧值保留", async () => {
    await agentsRoute.handle(new Request("http://localhost/web/config/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", name: "demo", data: { model: "gpt-4o" } }),
    }));
    expect(_agentStore.demo.permission).toEqual({ bash: "allow", task: "deny", skill: { "find-skills": "allow" } });
  });

  test("发送空对象覆盖旧 permission", async () => {
    await agentsRoute.handle(new Request("http://localhost/web/config/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", name: "demo", data: { permission: {} } }),
    }));
    expect(_agentStore.demo.permission).toEqual({});
  });
});
