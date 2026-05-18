// ── scheduler 核心功能集成测试 ──
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { scheduleTask, startScheduler, stopScheduler, unscheduleTask, setScheduleJobImpl } from "../services/scheduler";

const mockCancel = mock(() => {});
const mockNextInvocation = mock(() => ({ toJSDate: mock(() => new Date(Date.now() + 60000)) }));
const mockScheduleJob = mock((_config: unknown, handler: () => void) => ({
  cancel: mockCancel,
  nextInvocation: mockNextInvocation,
  __handler: handler,
}));

beforeEach(() => {
  setScheduleJobImpl(mockScheduleJob as any);
  stopScheduler();
  mockScheduleJob.mockClear();
  mockCancel.mockClear();
});

const TEST_USER_ID = "user_scheduler_test";
const TEST_TEAM_SLUG = "scheduler-test-team";

let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const existing = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing.length > 0) {
    TEST_TEAM_ID = existing[0].id;
    return;
  }
  const [created] = await db
    .insert(team)
    .values({
      name: "Scheduler Test Team",
      slug: TEST_TEAM_SLUG,
      createdBy: TEST_USER_ID,
    })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function ensureUser() {
  const existing = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existing.length > 0) return;
  const now = new Date();
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: "Scheduler Test",
    email: "scheduler-test@rcs.local",
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertTask(enabled: boolean, timezone: string | null, cron = "* * * * *") {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `task_${Date.now()}`,
      description: null,
      cron,
      timezone,
      enabled,
      url: "https://httpbin.org/post",
      method: "POST",
      headers: null,
      body: null,
      lastRunAt: null,
      nextRunAt: null,
      lastStatus: null,
    })
    .returning();
  return row;
}

async function cleanupRows() {
  try {
    await db.delete(taskExecutionLog);
  } catch {}
  if (TEST_TEAM_ID) {
    try {
      await db.delete(scheduledTask).where(eq(scheduledTask.teamId, TEST_TEAM_ID));
    } catch {}
  }
}

await ensureUser();
await ensureTeam();

describe("Scheduler", () => {
  beforeEach(async () => {
    stopScheduler();
    await cleanupRows();
    mockScheduleJob.mockClear();
    mockCancel.mockClear();
  });

  afterAll(async () => {
    stopScheduler();
    await cleanupRows();
    try {
      await db.delete(user).where(eq(user.id, TEST_USER_ID));
    } catch {}
    if (TEST_TEAM_ID) {
      try {
        await db.delete(team).where(eq(team.id, TEST_TEAM_ID));
      } catch {}
    }
  });

  describe("scheduleTask", () => {
    it("为 enabled 任务注册 cron job", () => {
      scheduleTask({ id: "task_abc", cron: "*/5 * * * *", timezone: "UTC", enabled: true });
      expect(mockScheduleJob).toHaveBeenCalled();
    });

    it("timezone 为 null 时不传 tz", () => {
      scheduleTask({ id: "task_local", cron: "*/5 * * * *", timezone: null, enabled: true });
      expect(mockScheduleJob).toHaveBeenCalledWith({ rule: "*/5 * * * *" }, expect.any(Function));
    });

    it("跳过 disabled 任务", () => {
      const before = mockScheduleJob.mock.calls.length;
      scheduleTask({ id: "task_disabled", cron: "*/5 * * * *", timezone: "UTC", enabled: false });
      expect(mockScheduleJob.mock.calls.length).toBe(before);
    });
  });

  describe("startScheduler", () => {
    it("只为 enabled 任务调度", async () => {
      const task1 = await insertTask(true, "UTC", "1 * * * *");
      const task2 = await insertTask(false, "UTC", "2 * * * *");

      await startScheduler();

      const scheduledRules = mockScheduleJob.mock.calls.map(([config]) => (config as { rule: string }).rule);
      expect(scheduledRules).toContain("1 * * * *");
      expect(scheduledRules).not.toContain("2 * * * *");
    });
  });

  describe("并发执行保护", () => {
    it("同一任务重复触发时写入 skipped 日志", async () => {
      const task = await insertTask(true, "UTC");

      scheduleTask({ id: task.id, cron: "* * * * *", timezone: "UTC", enabled: true });
      const handler = (mockScheduleJob.mock.results.at(-1)?.value as { __handler: () => void }).__handler;

      // 第一次触发
      handler();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // 第二次触发（第一次的 executeTask 还在 runningTasks 中）
      handler();
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 验证 DB 中有 skipped 日志
      const logs = await db.select().from(taskExecutionLog).where(eq(taskExecutionLog.taskId, task.id));
      expect(logs.some((row) => row.status === "skipped" && row.skipReason === "previous_run_still_active")).toBe(true);
    });
  });
});
