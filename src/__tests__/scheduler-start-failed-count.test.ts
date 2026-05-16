// ── startScheduler 跟踪失败调度数量 ──
import { describe, test, expect, mock, beforeEach } from "bun:test";

let scheduleJobShouldSucceed = true;

mock.module("node-schedule", () => ({
  default: {
    scheduleJob: mock(() => scheduleJobShouldSucceed
      ? { nextInvocation: () => null, cancel: mock() }
      : null),
  },
}));
mock.module("../repositories/task", () => ({
  scheduledTaskRepo: {
    listEnabled: mock(async () => []),
    update: mock(async () => {}),
  },
  taskExecutionLogRepo: {
    create: mock(async () => ({})),
  },
}));
mock.module("../logger", () => ({
  log: mock(),
  error: mock(),
}));
mock.module("./task", () => ({
  createExecutionLog: mock(async () => "log-id"),
  executeTaskById: mock(async () => ({ success: true })),
  getTaskById: mock(async () => null),
}));

const { startScheduler, stopScheduler } = await import("../services/scheduler");
const { scheduledTaskRepo } = await import("../repositories/task");

describe("startScheduler tracks failed count", () => {
  beforeEach(() => {
    stopScheduler();
    scheduleJobShouldSucceed = true;
    (scheduledTaskRepo.listEnabled as ReturnType<typeof mock>).mockReset();
    (scheduledTaskRepo.listEnabled as ReturnType<typeof mock>).mockResolvedValue([]);
  });

  // 全部成功时正常完成
  test("completes when all tasks scheduled", async () => {
    (scheduledTaskRepo.listEnabled as ReturnType<typeof mock>)
      .mockResolvedValueOnce([
        { id: "t1", cron: "*/5 * * * *", timezone: null, enabled: true },
        { id: "t2", cron: "*/10 * * * *", timezone: null, enabled: true },
      ]);

    await startScheduler();
    stopScheduler();
  });

  // 有失败时不抛异常（仅记日志）
  test("handles failed schedules gracefully", async () => {
    scheduleJobShouldSucceed = false;
    (scheduledTaskRepo.listEnabled as ReturnType<typeof mock>)
      .mockResolvedValueOnce([
        { id: "t1", cron: "invalid", timezone: null, enabled: true },
        { id: "t2", cron: "also-bad", timezone: null, enabled: true },
      ]);

    await startScheduler();
    stopScheduler();
  });

  // 无 enabled 任务时正常启动
  test("handles empty task list", async () => {
    (scheduledTaskRepo.listEnabled as ReturnType<typeof mock>)
      .mockResolvedValueOnce([]);

    await startScheduler();
    stopScheduler();
  });
});
