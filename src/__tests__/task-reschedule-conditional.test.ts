// 测试 updateTask 仅在调度相关字段变更时重新调度；toggleTask 验证更新结果
import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { updateTask, toggleTask } from "../services/task";
import { setScheduleJobImpl, stopScheduler, scheduleTask as registerTask } from "../services/scheduler";

// 跟踪 scheduleJobImpl 和 cancel 调用
let scheduleCallCount = 0;
let cancelCallCount = 0;
const mockCancel = () => {
  cancelCallCount++;
};
setScheduleJobImpl(
  mock((_config: any, handler: () => void) => {
    scheduleCallCount++;
    return { nextInvocation: () => new Date(), cancel: mockCancel };
  }) as any,
);

const TEST_USER_ID = "user_task_resched";
const TEST_TEAM_SLUG = "task-resched-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db
      .insert(user)
      .values({
        id: TEST_USER_ID,
        name: "Task Resched",
        email: "task-resched@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      })
      .catch(() => {});
  }
  const existing = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing.length > 0) {
    TEST_TEAM_ID = existing[0].id;
    return;
  }
  const [created] = await db
    .insert(team)
    .values({ name: "Task Resched Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(cron: string = "0 * * * *") {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `rs_${Date.now()}`,
      description: null,
      cron,
      timezone: null,
      enabled: true,
      url: "http://localhost:9999/test",
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

await ensureTeam();

describe("updateTask conditional reschedule + toggleTask", () => {
  beforeEach(() => {
    scheduleCallCount = 0;
    cancelCallCount = 0;
    stopScheduler();
  });

  afterAll(async () => {
    stopScheduler();
    if (TEST_TEAM_ID) {
      try {
        await db.delete(taskExecutionLog);
      } catch {}
      try {
        await db.delete(scheduledTask).where(eq(scheduledTask.teamId, TEST_TEAM_ID));
      } catch {}
      try {
        await db.delete(team).where(eq(team.id, TEST_TEAM_ID));
      } catch {}
    }
    try {
      await db.delete(user).where(eq(user.id, TEST_USER_ID));
    } catch {}
  });

  // cron 变更触发 reschedule
  test("reschedules when cron changes", async () => {
    const task = await insertTask();
    registerTask({ id: task.id, cron: task.cron, timezone: task.timezone, enabled: true });
    const result = await updateTask(TEST_TEAM_ID!, task.id, { cron: "*/5 * * * *" });
    expect(result.success).toBe(true);
    expect(cancelCallCount + scheduleCallCount).toBeGreaterThan(0);
  });

  // enabled 变更触发 reschedule
  test("reschedules when enabled changes", async () => {
    const task = await insertTask();
    registerTask({ id: task.id, cron: task.cron, timezone: task.timezone, enabled: true });
    const result = await updateTask(TEST_TEAM_ID!, task.id, { enabled: false });
    expect(result.success).toBe(true);
    expect(cancelCallCount + scheduleCallCount).toBeGreaterThan(0);
  });

  // name 变更不触发 reschedule
  test("does not reschedule when only name changes", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { name: "new-name" });
    expect(result.success).toBe(true);
    expect(cancelCallCount + scheduleCallCount).toBe(0);
  });

  // description 变更不触发 reschedule
  test("does not reschedule when only description changes", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { description: "new desc" });
    expect(result.success).toBe(true);
    expect(cancelCallCount + scheduleCallCount).toBe(0);
  });

  // url 变更不触发 reschedule
  test("does not reschedule when only url changes", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { url: "http://new.example.com" });
    expect(result.success).toBe(true);
    expect(cancelCallCount + scheduleCallCount).toBe(0);
  });

  // timezone 变更触发 reschedule
  test("reschedules when timezone changes", async () => {
    const task = await insertTask();
    registerTask({ id: task.id, cron: task.cron, timezone: task.timezone, enabled: true });
    const result = await updateTask(TEST_TEAM_ID!, task.id, { timezone: "Asia/Tokyo" });
    expect(result.success).toBe(true);
    expect(cancelCallCount + scheduleCallCount).toBeGreaterThan(0);
  });

  // toggle 成功时返回正确状态
  test("toggleTask returns success with toggled enabled", async () => {
    const task = await insertTask();
    const result = await toggleTask(TEST_TEAM_ID!, task.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
    }
  });
});
