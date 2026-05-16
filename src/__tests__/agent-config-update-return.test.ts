// ── updateAgentConfig 返回 boolean（与 deleteAgentConfig 对齐） ──
import { describe, test, expect, mock } from "bun:test";

const updateResults: Array<unknown[]> = [];

mock.module("../db", () => ({
  db: {
    select: mock(() => ({ from: mock(() => ({ where: mock(async () => []) })) })),
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoUpdate: mock(() => {
          return { returning: mock(async () => [{ id: "ac-1" }]) };
        }),
      })),
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(async () => updateResults.shift() ?? []),
        })),
      })),
    })),
    delete: mock(() => ({
      where: mock(() => ({ returning: mock(async () => []) })),
    })),
  },
}));
mock.module("../db/schema", () => ({
  agentConfig: {
    id: "id", userId: "userId", name: "name", updatedAt: "updatedAt",
    model: "model", prompt: "prompt", steps: "steps", mode: "mode",
    permission: "permission", variant: "variant", temperature: "temperature",
    topP: "topP", disable: "disable", hidden: "hidden", color: "color",
    description: "description", knowledge: "knowledge",
  },
}));
mock.module("drizzle-orm", () => ({
  eq: mock((_: unknown, v: unknown) => v),
  and: mock((...args: unknown[]) => args),
}));
mock.module("../services/agent-knowledge", () => ({
  resolveAgentKnowledgePolicy: mock(() => ({ searchFirst: false, maxResults: 5, defaultNamespaces: [] })),
}));

const { updateAgentConfig } = await import("../services/config/agent-config");

describe("updateAgentConfig returns boolean", () => {
  // 存在的 agent config 返回 true
  test("returns true when agent config exists", async () => {
    updateResults.push([{ id: "ac-1" }]);
    const result = await updateAgentConfig("user-1", "general", { model: "gpt-4" });
    expect(result).toBe(true);
  });

  // 不存在的 agent config 返回 false
  test("returns false when agent config does not exist", async () => {
    updateResults.push([]);
    const result = await updateAgentConfig("user-1", "nonexistent", { model: "gpt-4" });
    expect(result).toBe(false);
  });
});
