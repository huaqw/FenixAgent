import { describe, test, expect, mock, beforeEach } from "bun:test";

// mock repositories
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

describe("writeLogAndReturn: task status update failure", () => {
  beforeEach(() => {
    mockLogCreate.mockClear();
    mockTaskUpdate.mockClear();
    mockTaskGetById.mockClear();
  });

  // task status update 失败时不应产生重复日志
  test("task status update failure does not cause duplicate log entries", async () => {
    mockTaskGetById.mockResolvedValueOnce({
      id: "task_abc",
      url: "http://localhost:9999/ok",
      method: "GET",
      headers: null,
      enabled: true,
    });

    // writeLogAndReturn 写日志成功但 taskUpdate 失败
    mockTaskUpdate.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await executeTaskById("task_abc", "manual");

    // 应返回成功（日志已写入），不应因 taskUpdate 失败而返回错误
    expect(result.success).toBe(true);
    // 日志只创建一次
    expect(mockLogCreate).toHaveBeenCalledTimes(1);
  });

  // task status update 成功时正常返回
  test("task status update success returns normally", async () => {
    mockTaskGetById.mockResolvedValueOnce({
      id: "task_def",
      url: "http://localhost:9999/ok",
      method: "GET",
      headers: null,
      enabled: true,
    });

    const result = await executeTaskById("task_def", "cron");

    expect(result.success).toBe(true);
    expect(mockLogCreate).toHaveBeenCalledTimes(1);
    expect(mockTaskUpdate).toHaveBeenCalledTimes(1);
  });

  // 日志创建失败时返回 WRITE_ERROR
  test("log creation failure returns WRITE_ERROR without calling taskUpdate", async () => {
    mockTaskGetById.mockResolvedValueOnce({
      id: "task_ghi",
      url: "http://localhost:9999/ok",
      method: "GET",
      headers: null,
      enabled: true,
    });

    mockLogCreate.mockRejectedValueOnce(new Error("Log table full"));

    const result = await executeTaskById("task_ghi", "manual");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("WRITE_ERROR");
    }
  });
});
