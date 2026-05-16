// ── clearExecutionLogs 所有权校验 ──
import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("../repositories/task", () => ({
  scheduledTaskRepo: {
    getByUserAndId: mock(async () => null),
    deleteByUserAndId: mock(async () => false),
  },
  taskExecutionLogRepo: {
    deleteByTask: mock(async () => {}),
  },
}));
mock.module("../services/config/jsonb", () => ({
  parseJsonb: mock((v: unknown) => v),
}));
mock.module("../logger", () => ({
  log: mock(),
  error: mock(),
}));
mock.module("./scheduler", () => ({
  scheduleTask: mock(() => true),
  rescheduleTask: mock(() => true),
  unscheduleTask: mock(),
}));

const { clearExecutionLogs } = await import("../services/task");

const { scheduledTaskRepo, taskExecutionLogRepo } = await import("../repositories/task");

describe("clearExecutionLogs ownership verification", () => {
  beforeEach(() => {
    (scheduledTaskRepo.getByUserAndId as ReturnType<typeof mock>).mockReset();
    (taskExecutionLogRepo.deleteByTask as ReturnType<typeof mock>).mockReset();
  });

  // 任务不属于该用户时返回 NOT_FOUND
  test("returns NOT_FOUND when task does not belong to user", async () => {
    (scheduledTaskRepo.getByUserAndId as ReturnType<typeof mock>)
      .mockResolvedValueOnce(null);

    const result = await clearExecutionLogs("user-x", "task-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
    expect(taskExecutionLogRepo.deleteByTask).not.toHaveBeenCalled();
  });

  // 任务属于该用户时清除日志成功
  test("deletes logs when task belongs to user", async () => {
    (scheduledTaskRepo.getByUserAndId as ReturnType<typeof mock>)
      .mockResolvedValueOnce({ id: "task-1", userId: "user-a" });

    const result = await clearExecutionLogs("user-a", "task-1");
    expect(result.success).toBe(true);
    expect(taskExecutionLogRepo.deleteByTask).toHaveBeenCalledWith("task-1");
  });

  // 其他用户的任务不会触发 delete
  test("does not delete logs for other user's task", async () => {
    (scheduledTaskRepo.getByUserAndId as ReturnType<typeof mock>)
      .mockResolvedValueOnce(null);

    await clearExecutionLogs("user-wrong", "task-1");
    expect(taskExecutionLogRepo.deleteByTask).not.toHaveBeenCalled();
  });
});
