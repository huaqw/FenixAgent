import { describe, expect, it, mock } from "bun:test";

// mock node-schedule before import
const mockCancel = mock(() => {});
const mockScheduleJob = mock((_config: unknown, handler: () => void) => ({
  cancel: mockCancel,
  nextInvocation: () => ({ toDate: () => new Date() }),
  __handler: handler,
}));
mock.module("node-schedule", () => ({
  default: { scheduleJob: mockScheduleJob },
}));

// mock logger
mock.module("../logger", () => ({
  log: mock(() => {}),
  error: mock(() => {}),
}));

// mock task module — getTaskById 返回 disabled 任务
const mockGetTaskById = mock(() => Promise.resolve(null as any));
mock.module("../services/task", () => ({
  getTaskById: mockGetTaskById,
  executeTaskById: mock(() => Promise.resolve({ success: true })),
  createExecutionLog: mock(() => Promise.resolve("log-id")),
}));

// mock repositories/task
mock.module("../repositories/task", () => ({
  scheduledTaskRepo: {
    listEnabled: mock(() => Promise.resolve([])),
    update: mock(() => Promise.resolve({})),
  },
  taskExecutionLogRepo: {},
}));

const { scheduleTask, unscheduleTask } = await import("../services/scheduler");

// 重置 mock 调用记录
mockCancel.mockClear();
mockScheduleJob.mockClear();

describe("scheduler disabled task auto-unschedule", () => {
  it("disabled 任务执行时自动 unschedule cron job", async () => {
    mockScheduleJob.mockClear();
    mockCancel.mockClear();

    // 先 schedule 一个 enabled 任务
    scheduleTask({ id: "test-auto-unschedule", cron: "* * * * *", enabled: true });
    expect(mockScheduleJob).toHaveBeenCalled();

    // 提取 handler（mockScheduleJob 的第二个参数是 handler）
    const handler = (mockScheduleJob.mock.results.at(-1)?.value as { __handler: () => void }).__handler;
    expect(typeof handler).toBe("function");

    // 模拟任务被 DB 直接 disabled（bypass service toggleTask）
    mockGetTaskById.mockImplementation(() =>
      Promise.resolve({ id: "test-auto-unschedule", enabled: false, cron: "* * * * *" }),
    );

    // 触发 cron handler
    handler();

    // executeTask 是异步的，等一个 microtask
    await new Promise((resolve) => setTimeout(resolve, 10));

    // unscheduleTask 应该被调用（cancel mock 被调用）
    expect(mockCancel).toHaveBeenCalled();
  });

  it("disabled 任务后续不再触发 cron（unschedule 后 job 被移除）", async () => {
    mockScheduleJob.mockClear();
    mockCancel.mockClear();

    // schedule 一个 enabled 任务
    scheduleTask({ id: "test-unschedule-verify", cron: "*/5 * * * *", enabled: true });

    // 手动 unschedule
    unscheduleTask("test-unschedule-verify");
    expect(mockCancel).toHaveBeenCalled();

    // 再次 schedule 同一任务（enabled=true），确认可以重新注册
    const beforeCalls = mockScheduleJob.mock.calls.length;
    scheduleTask({ id: "test-unschedule-verify", cron: "*/5 * * * *", enabled: true });
    expect(mockScheduleJob.mock.calls.length).toBe(beforeCalls + 1);
  });
});
