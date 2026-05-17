import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── getAgentFullConfig 查询并行化验证（R27: 4 路并行→1 轮完成）──

const mockProviders: any[] = [{ id: "p1", name: "openai", userId: "u1" }];
const mockMcpServers: any[] = [{ id: "m1", name: "github", userId: "u1", enabled: true }];
const mockGlobalSkills: any[] = [{ id: "s1", name: "global-skill", userId: "u1", agentConfigId: null }];
const mockAgentSkills: any[] = [
  { id: "s1", name: "global-skill", userId: "u1", agentConfigId: null },
  { id: "s2", name: "agent-skill", userId: "u1", agentConfigId: "ac1" },
];
const mockAgentConfig: any = { id: "ac1", name: "coder", userId: "u1" };

const mockDbSelect: any = mock(() => Promise.resolve([]));

mock.module("../db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

mock.module("../db/schema", () => ({
  provider: Symbol("provider"),
  mcpServer: Symbol("mcpServer"),
  skill: Symbol("skill"),
  agentConfig: Symbol("agentConfig"),
}));

const { getAgentFullConfig } = await import("../services/config/aggregate");

/** Drizzle where() mock：返回 thenable 对象（直接 await 得到结果，.limit() 也得到结果） */
function createThenableWhere(result: any) {
  const thenable: any = {
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    limit: () => Promise.resolve(result),
  };
  return thenable;
}

describe("getAgentFullConfig", () => {
  beforeEach(() => {
    mockDbSelect.mockClear();
  });

  // agentConfigId 为 null 时，3 个并行查询返回正确结果
  test("returns null agentConfig with global skills when agentConfigId is null", async () => {
    let callIndex = 0;
    const results = [mockProviders, mockMcpServers, mockGlobalSkills];

    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => createThenableWhere(results[callIndex++]),
      }),
    }));

    const result = await getAgentFullConfig({ teamId: "test-team", userId: "u1", role: "owner" }, null);

    expect(result.agentConfig).toBe(null);
    expect(result.providers).toEqual(mockProviders);
    expect(result.mcpServers).toEqual(mockMcpServers);
    expect(result.skills).toEqual(mockGlobalSkills);
    // 3 个并行查询
    expect(mockDbSelect).toHaveBeenCalledTimes(3);
  });

  // agentConfigId 存在时，4 路并行拉取 providers/mcpServers/agentConfig/skills → 1 轮完成
  test("returns agentConfig and skills when agentConfigId is provided", async () => {
    let callIndex = 0;
    const results = [mockProviders, mockMcpServers, [mockAgentConfig], mockAgentSkills];

    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => createThenableWhere(results[callIndex++]),
      }),
    }));

    const result = await getAgentFullConfig({ teamId: "test-team", userId: "u1", role: "owner" }, "ac1");

    expect(result.agentConfig).toEqual(mockAgentConfig);
    expect(result.providers).toEqual(mockProviders);
    expect(result.mcpServers).toEqual(mockMcpServers);
    expect(result.skills).toEqual(mockAgentSkills);
    // 4 路并行查询，1 轮完成
    expect(mockDbSelect).toHaveBeenCalledTimes(4);
  });

  // agentConfigId 指向不存在的记录时，内存过滤掉 agent-scoped skills
  test("falls back to global skills when agentConfigId not found (memory filter)", async () => {
    let callIndex = 0;
    // 第 4 个结果包含全局 + agent-scoped skills
    const results = [mockProviders, mockMcpServers, [], mockAgentSkills];

    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => createThenableWhere(results[callIndex++]),
      }),
    }));

    const result = await getAgentFullConfig({ teamId: "test-team", userId: "u1", role: "owner" }, "nonexistent");

    expect(result.agentConfig).toBe(null);
    // 只保留 agentConfigId === null 的全局 skills
    expect(result.skills).toEqual([mockAgentSkills[0]]);
    // 仍然是 4 次查询（无第二轮查询）
    expect(mockDbSelect).toHaveBeenCalledTimes(4);
  });
});
