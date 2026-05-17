// 测试 scheduleTask 返回 boolean 表示调度成功/失败
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { scheduleTask, stopScheduler, setScheduleJobImpl } from "../services/scheduler";

const mockScheduleJob = mock((_config: unknown, _handler: () => void) => ({
  cancel: mock(() => {}),
  nextInvocation: () => new Date(),
}));

beforeEach(() => {
  stopScheduler();
  mockScheduleJob.mockClear();
  setScheduleJobImpl(mockScheduleJob as any);
});

describe("scheduleTask return value", () => {
  // 有效 cron 表达式返回 true
  test("returns true when job is created successfully", () => {
    const result = scheduleTask({ id: "task_1", cron: "* * * * *", enabled: true });
    expect(result).toBe(true);
  });

  // disabled 任务不调度但返回 true（no-op）
  test("returns true for disabled task (no-op)", () => {
    const result = scheduleTask({ id: "task_2", cron: "* * * * *", enabled: false });
    expect(result).toBe(true);
  });

  // scheduleJobImpl 返回 null 时表示无效 cron 表达式
  test("returns false when node-schedule rejects cron expression", () => {
    mockScheduleJob.mockImplementationOnce(() => null as any);
    const result = scheduleTask({ id: "task_3", cron: "invalid-cron", enabled: true });
    expect(result).toBe(false);
  });

  // 带时区的任务也能成功调度
  test("returns true when timezone provided and job created", () => {
    const result = scheduleTask({ id: "task_4", cron: "0 * * * *", timezone: "Asia/Shanghai", enabled: true });
    expect(result).toBe(true);
  });
});
