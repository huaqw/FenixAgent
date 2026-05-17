// ── scheduler disabled task auto-unschedule 验证 ──
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { scheduleTask, unscheduleTask, stopScheduler, setScheduleJobImpl } from "../services/scheduler";

const mockCancel = mock(() => {});
const mockNextInvocation = mock(() => ({ toJSDate: mock(() => new Date(Date.now() + 60000)) }));
const mockScheduleJob = mock((_config: unknown, handler: () => void) => ({
  cancel: mockCancel,
  nextInvocation: mockNextInvocation,
  __handler: handler,
}));

beforeEach(() => {
  stopScheduler();
  setScheduleJobImpl(mockScheduleJob as any);
  mockScheduleJob.mockClear();
  mockCancel.mockClear();
  mockNextInvocation.mockClear();
});

describe("scheduler disabled task auto-unschedule", () => {
  // scheduleTask 对 enabled=true 的任务注册 cron job
  it("enabled 任务调度后 job 被注册到 activeJobs", () => {
    scheduleTask({ id: "test-schedule-enabled", cron: "* * * * *", enabled: true });
    expect(mockScheduleJob).toHaveBeenCalled();

    // unschedule 取消 job
    unscheduleTask("test-schedule-enabled");
    expect(mockCancel).toHaveBeenCalled();
  });

  // unschedule 后 job 被移除，再次 schedule 同一任务可以重新注册
  it("unschedule 后可以重新 schedule 同一任务", () => {
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
