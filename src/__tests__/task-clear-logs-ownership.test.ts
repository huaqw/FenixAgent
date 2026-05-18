// ── clearExecutionLogs 所有权校验 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { clearExecutionLogs } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_clear_logs_own";
const TEST_TEAM_SLUG = "clear-logs-own-team";
const OTHER_TEAM_SLUG = "clear-logs-other-team";
let TEST_TEAM_ID: string | undefined;
let OTHER_TEAM_ID: string | undefined;

async function ensureTeams() {
  const now = new Date();
  let existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db
      .insert(user)
      .values({
        id: TEST_USER_ID,
        name: "Clear Logs",
        email: "clear-logs@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }

  const existing1 = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing1.length > 0) {
    TEST_TEAM_ID = existing1[0].id;
  } else {
    const [c] = await db
      .insert(team)
      .values({ name: "Clear Logs Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
      .returning();
    TEST_TEAM_ID = c.id;
  }

  const existing2 = await db.select().from(team).where(eq(team.slug, OTHER_TEAM_SLUG)).limit(1);
  if (existing2.length > 0) {
    OTHER_TEAM_ID = existing2[0].id;
  } else {
    const [c] = await db
      .insert(team)
      .values({ name: "Clear Logs Other Team", slug: OTHER_TEAM_SLUG, createdBy: TEST_USER_ID })
      .returning();
    OTHER_TEAM_ID = c.id;
  }
}

async function insertTask(teamId: string, suffix: string) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId,
      name: `cl_${suffix}_${Date.now()}`,
      description: null,
      cron: "* * * * *",
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

const { randomUUID } = await import("node:crypto");

await ensureTeams();

describe("clearExecutionLogs ownership verification", () => {
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
    if (OTHER_TEAM_ID) {
      try {
        await db.delete(taskExecutionLog);
      } catch {}
      try {
        await db.delete(scheduledTask).where(eq(scheduledTask.teamId, OTHER_TEAM_ID));
      } catch {}
      try {
        await db.delete(team).where(eq(team.id, OTHER_TEAM_ID));
      } catch {}
    }
    try {
      await db.delete(user).where(eq(user.id, TEST_USER_ID));
    } catch {}
  });

  // 任务不属于该团队时返回 NOT_FOUND
  test("returns NOT_FOUND when task does not belong to team", async () => {
    const result = await clearExecutionLogs(TEST_TEAM_ID!, randomUUID());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  // 任务属于该团队时清除日志成功
  test("deletes logs when task belongs to team", async () => {
    const task = await insertTask(TEST_TEAM_ID!, "own");
    // 先插入一条日志
    await db.insert(taskExecutionLog).values({
      id: randomUUID(),
      taskId: task.id,
      status: "success",
      error: null,
      duration: 100,
      triggeredBy: "manual",
      skipReason: null,
      resultSummary: "ok",
      createdAt: new Date(),
    });

    const result = await clearExecutionLogs(TEST_TEAM_ID!, task.id);
    expect(result.success).toBe(true);

    // 验证日志已删除
    const logs = await db.select().from(taskExecutionLog).where(eq(taskExecutionLog.taskId, task.id));
    expect(logs.length).toBe(0);
  });

  // 其他团队的任务返回 NOT_FOUND，不会触发 delete
  test("returns NOT_FOUND for other team's task", async () => {
    const otherTask = await insertTask(OTHER_TEAM_ID!, "other");
    const result = await clearExecutionLogs(TEST_TEAM_ID!, otherTask.id);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });
});
