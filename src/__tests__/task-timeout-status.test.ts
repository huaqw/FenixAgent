import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── executeTaskById timeout vs failed 状态区分 ──

const mockLogCreate = mock(async () => ({ id: "log_1" }));
const mockTaskUpdate = mock(async () => {});
const mockTaskGetById = mock(async (): Promise<any> => null);

mock.module("../repositories/task", () => ({
  scheduledTaskRepo: {
    listByUser: mock(async () => []),
    getById: mockTaskGetById,
    getByUserAndId: mock(async () => null),
    create: mock(async (d: any) => d),
    update: mockTaskUpdate,
    deleteByUserAndId: mock(async () => true),
    listEnabled: mock(async () => []),
  },
  taskExecutionLogRepo: {
    listByTask: mock(async () => []),
    listByTaskPaged: mock(async () => ({ rows: [], total: 0 })),
    create: mockLogCreate,
    deleteByTask: mock(async () => {}),
  },
}));
mock.module("../services/scheduler", () => ({
  scheduleTask: mock(() => {}),
  rescheduleTask: mock(() => {}),
  unscheduleTask: mock(() => {}),
}));

mock.module("../services/config/jsonb", () => ({
  parseJsonb: (v: unknown) => v,
}));

const { executeTaskById } = await import("../services/task");

describe("executeTaskById timeout status differentiation", () => {
  beforeEach(() => {
    mockLogCreate.mockClear();
    mockTaskUpdate.mockClear();
    mockTaskGetById.mockClear();
  });

  // fetch 抛出 AbortError（AbortSignal.timeout 触发）时状态为 "timeout"
  test("sets status to 'timeout' when fetch throws AbortError", async () => {
    // 保存原始 fetch
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as unknown as typeof fetch;

    mockTaskGetById.mockResolvedValueOnce({
      id: "task_timeout",
      url: "http://localhost:9999/slow",
      method: "GET",
      headers: null,
      enabled: true,
    });

    const result = await executeTaskById("task_timeout", "cron");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("timeout");
    }

    globalThis.fetch = origFetch;
  });

  // fetch 抛出网络错误时状态为 "failed"
  test("sets status to 'failed' when fetch throws network error", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    mockTaskGetById.mockResolvedValueOnce({
      id: "task_fail",
      url: "http://localhost:9999/down",
      method: "POST",
      headers: null,
      enabled: true,
    });

    const result = await executeTaskById("task_fail", "manual");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("failed");
    }

    globalThis.fetch = origFetch;
  });

  // 非 DOMException 错误也标为 "failed"
  test("sets status to 'failed' for generic Error", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;

    mockTaskGetById.mockResolvedValueOnce({
      id: "task_err",
      url: "http://localhost:9999/err",
      method: "GET",
      headers: null,
      enabled: true,
    });

    const result = await executeTaskById("task_err", "cron");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("failed");
    }

    globalThis.fetch = origFetch;
  });
});
