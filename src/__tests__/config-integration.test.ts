import { describe, test, expect, mock } from "bun:test";

// Mock auth — bypass session check for all config routes
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

// Mock config service
mock.module("../services/config", () => ({
  getConfig: async () => ({}),
  getSection: async () => undefined,
  setSection: async () => {},
  replaceSection: async () => {},
  modifySection: async (_section: string, fn: (data: any) => any) => {
    const result = fn({});
    return result;
  },
  deleteSection: async () => false,
  setTopLevelField: async () => {},
}));

// Mock skill service
mock.module("../services/skill", () => ({
  SKILLS_DIR: "/tmp/test-skills",
  listSkills: async () => [],
  getSkill: async () => null,
  setSkill: async (_name: string, data: any) => ({ name: _name, enabled: true, description: data.description }),
  deleteSkill: async () => true,
  enableSkill: async () => true,
  disableSkill: async () => true,
  listSkillSources: async () => [],
  importSkillDirectories: async () => ({ imported: [], skipped: [], conflicts: [] }),
  importWorkspaceSkillDirectories: async () => ({ imported: [], skipped: [], conflicts: [] }),
  getWorkspaceSkill: async () => null,
  setWorkspaceSkill: async (_ws: string, _name: string, data: any) => ({ name: _name, enabled: true, description: data.description }),
  deleteWorkspaceSkill: async () => true,
  listWorkspaceSkills: async () => [],
}));

const configRoute = (await import("../routes/web/config/index")).default;

function request(path: string, init?: RequestInit) {
  return configRoute.handle(new Request(`http://localhost${path}`, init));
}

describe("Config Route Integration", () => {
  test("mocked sessionAuth 通过后返回成功", async () => {
    const res = await request("/web/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("无效 module 返回 404", async () => {
    const res = await request("/web/config/invalid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    expect(res.status).toBe(404);
  });

  test("providers 路由可达", async () => {
    const res = await request("/web/config/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    expect(res.status).not.toBe(404);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("models 路由可达", async () => {
    const res = await request("/web/config/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get" }),
    });
    expect(res.status).not.toBe(404);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("agents 路由可达", async () => {
    const res = await request("/web/config/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    expect(res.status).not.toBe(404);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("skills 路由可达", async () => {
    const res = await request("/web/config/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    expect(res.status).not.toBe(404);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
