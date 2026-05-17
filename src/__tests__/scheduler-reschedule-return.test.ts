// ── scheduler rescheduleTask 返回 boolean（与 scheduleTask 对齐） ──
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { scheduleTask, rescheduleTask, unscheduleTask, stopScheduler, setScheduleJobImpl } from "../services/scheduler";

const mockScheduleJob = mock((_config: unknown, _handler: () => void) => ({
  cancel: mock(() => {}),
  nextInvocation: () => new Date(),
}));

beforeEach(() => {
  stopScheduler();
  mockScheduleJob.mockClear();
  setScheduleJobImpl(mockScheduleJob as any);
});

describe("rescheduleTask returns boolean", () => {
  // rescheduleTask 委托 scheduleTask，应传播返回值
  test("returns true when scheduleTask succeeds", () => {
    const result = rescheduleTask({
      id: "__test_1",
      cron: "*/5 * * * *",
      timezone: null,
      enabled: true,
    });
    expect(result).toBe(true);
    unscheduleTask("__test_1");
  });

  // disabled task 不调度但返回 true（与 scheduleTask 一致）
  test("returns true for disabled task (no-op)", () => {
    const result = rescheduleTask({
      id: "__test_2",
      cron: "*/5 * * * *",
      timezone: null,
      enabled: false,
    });
    expect(result).toBe(true);
  });

  // scheduleTask 和 rescheduleTask 对 enabled=false 行为一致
  test("scheduleTask returns true for disabled task", () => {
    const result = scheduleTask({
      id: "__test_disabled",
      cron: "*/5 * * * *",
      enabled: false,
    });
    expect(result).toBe(true);
  });
});
