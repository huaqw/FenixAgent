import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── stopAllInstances stopping 状态跳过 ──

interface FakeSnapshot {
  instanceId: string;
  status: string;
  errorMessage: string | null;
  pluginMetadata: Record<string, unknown>;
  createdAt: Date;
}

const mockListInstances = mock((): FakeSnapshot[] => []);
const mockStopInstance = mock(async (_id: string) => {});

mock.module("../services/core-bootstrap", () => ({
  getCoreRuntime: () => ({
    listInstances: mockListInstances,
    getInstance: mock(() => null),
    stopInstance: mockStopInstance,
    launchInstance: mock(async () => ({})),
  }),
}));

mock.module("../services/launch-spec-builder", () => ({
  buildLaunchSpec: mock(async () => ({})),
}));

mock.module("../services/config-pg", () => ({
  getAgentConfigById: mock(async () => null),
  getAgentFullConfig: mock(async () => ({
    agentConfig: null,
    providers: [],
    skills: [],
    mcpServers: [],
  })),
}));

mock.module("../repositories", () => ({
  environmentRepo: {
    getById: mock(async () => null),
  },
}));

mock.module("../services/session", () => ({
  findOrCreateForEnvironment: mock(async () => ({ id: "ses_1" })),
}));
const { stopAllInstances, listInstances } = await import("../services/instance");

describe("stopAllInstances skips stopping status", () => {
  beforeEach(() => {
    mockListInstances.mockClear();
    mockStopInstance.mockClear();
  });

  // 跳过 stopped/stopping，只 stop running 和 error
  test("skips stopped and stopping instances, only stops running ones", async () => {
    mockListInstances.mockReturnValueOnce([
      { instanceId: "inst_1", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_2", status: "stopped", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_3", status: "stopping", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_4", status: "error", errorMessage: "boom", pluginMetadata: {}, createdAt: new Date() },
    ] as FakeSnapshot[]);

    await stopAllInstances();

    // running (inst_1) 和 error (inst_4) 应被 stop；stopped/stopping 跳过
    expect(mockStopInstance).toHaveBeenCalledTimes(2);
    expect(mockStopInstance.mock.calls[0][0] as string).toBe("inst_1");
    expect(mockStopInstance.mock.calls[1][0] as string).toBe("inst_4");
  });

  // 全部 stopped/stopping 时无需 stop
  test("no stops when all instances are stopped", async () => {
    mockListInstances.mockReturnValueOnce([
      { instanceId: "inst_a", status: "stopped", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_b", status: "stopping", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
    ] as FakeSnapshot[]);

    await stopAllInstances();
    expect(mockStopInstance).not.toHaveBeenCalled();
  });

  // 无实例时正常退出
  test("handles empty instance list", async () => {
    mockListInstances.mockReturnValueOnce([] as FakeSnapshot[]);
    await stopAllInstances();
    expect(mockStopInstance).not.toHaveBeenCalled();
  });
});

// ── listInstances 过滤无 supplement 的实例 ──

describe("listInstances filters entries without supplement", () => {
  beforeEach(() => {
    mockListInstances.mockClear();
  });

  test("returns empty when no supplements match", () => {
    mockListInstances.mockReturnValueOnce([
      { instanceId: "inst_orphan", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
    ] as FakeSnapshot[]);
    const result = listInstances("user_1");
    expect(result).toEqual([]);
  });
});
