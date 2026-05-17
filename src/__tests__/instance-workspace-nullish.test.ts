import { describe, expect, it, mock } from "bun:test";

// mock core-bootstrap
const mockListInstances = mock(() => []);
const mockGetInstance = mock(() => undefined);
mock.module("../services/core-bootstrap", () => ({
  getCoreRuntime: () => ({
    listInstances: mockListInstances,
    getInstance: mockGetInstance,
  }),
}));

// mock launch-spec-builder
mock.module("../services/launch-spec-builder", () => ({
  buildLaunchSpec: mock(() => Promise.resolve({})),
}));

// mock config-pg — 必须导出 instance.ts 实际引用的名称
mock.module("../services/config-pg", () => ({
  getAgentConfigById: mock(() => Promise.resolve(null)),
  getAgentFullConfig: mock(() => Promise.resolve({ agentConfig: null, providers: [], skills: [], mcpServers: [] })),
}));

// mock repositories
const mockEnvGetById = mock(() => Promise.resolve(undefined as any));
mock.module("../repositories", () => ({
  environmentRepo: { getById: mockEnvGetById },
  sessionRepo: {},
}));

// mock errors
mock.module("../errors", () => ({
  NotFoundError: class extends Error { code = "NOT_FOUND"; statusCode = 404; constructor(m: string) { super(m); } },
  AppError: class extends Error { code: string; statusCode: number; constructor(m: string, code: string, status = 500) { super(m); this.code = code; this.statusCode = status; } },
}));

const { spawnInstanceFromEnvironment } = await import("../services/instance");

// 补充 supplement 中 teamId 的默认值：env.teamId ?? userId
// mockEnvGetById 需要返回含 teamId 的记录
function makeEnv(overrides: Record<string, unknown>) {
  return {
    userId: "user-1",
    teamId: "user-1",
    ...overrides,
  };
}

describe("instance workspacePath ?? vs || 语义", () => {
  it("workspacePath 为 null 时 fallback 到 directory", async () => {
    mockEnvGetById.mockImplementation(() =>
      Promise.resolve(makeEnv({
        id: "env-test",
        workspacePath: null,
        directory: "/home/user/project",
        secret: "secret",
      })),
    );
    // workspacePath=null, directory="/home/user/project" → cwd="/home/user/project"
    // 不应抛 "Workspace directory not set" 错误（会因 launchInstance mock 缺失抛其他错误）
    try {
      await spawnInstanceFromEnvironment("user-1", "env-test");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain("Workspace directory not set");
    }
  });

  it("workspacePath 和 directory 都为 null 时抛 VALIDATION_ERROR", async () => {
    mockEnvGetById.mockImplementation(() =>
      Promise.resolve(makeEnv({
        id: "env-test2",
        workspacePath: null,
        directory: null,
        secret: "secret",
      })),
    );
    try {
      await spawnInstanceFromEnvironment("user-1", "env-test2");
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect(err).toHaveProperty("code", "VALIDATION_ERROR");
      expect((err as Error).message).toContain("Workspace directory not set");
    }
  });

  it("workspacePath 为空字符串时 ?? 保留空串、触发 !cwd 校验", async () => {
    // ?? 语义：空字符串不被 fallback 到 directory，保留 ""
    // 然后 !cwd（!""）为 true → VALIDATION_ERROR
    mockEnvGetById.mockImplementation(() =>
      Promise.resolve(makeEnv({
        id: "env-test3",
        workspacePath: "",
        directory: "/home/user/project",
        secret: "secret",
      })),
    );
    try {
      await spawnInstanceFromEnvironment("user-1", "env-test3");
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect(err).toHaveProperty("code", "VALIDATION_ERROR");
      expect((err as Error).message).toContain("Workspace directory not set");
    }
  });
});
