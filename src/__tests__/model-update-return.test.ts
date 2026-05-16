// ── updateModel 返回 boolean（与 removeModel 对齐） ──
import { describe, test, expect, mock } from "bun:test";

const updateResults: Array<unknown[]> = [];

mock.module("../db", () => ({
  db: {
    insert: mock(() => ({
      values: mock(() => ({
        onConflictDoUpdate: mock(() => {
          return { returning: mock(async () => [{ id: "m-1" }]) };
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
  model: {
    id: "id", providerId: "providerId", modelId: "modelId",
    displayName: "displayName", updatedAt: "updatedAt",
    modalities: "modalities", limitConfig: "limitConfig",
    cost: "cost", options: "options",
  },
}));
mock.module("drizzle-orm", () => ({
  eq: mock((_: unknown, v: unknown) => v),
  and: mock((...args: unknown[]) => args),
}));

const { updateModel } = await import("../services/config/model");

describe("updateModel returns boolean", () => {
  // 存在的 model 返回 true
  test("returns true when model exists", async () => {
    updateResults.push([{ id: "m-1" }]);
    const result = await updateModel("prov-1", "gpt-4", { displayName: "GPT-4" });
    expect(result).toBe(true);
  });

  // 不存在的 model 返回 false
  test("returns false when model does not exist", async () => {
    updateResults.push([]);
    const result = await updateModel("prov-1", "nonexistent", { displayName: "X" });
    expect(result).toBe(false);
  });
});
