// 测试 listExecutionLogs total 字段始终为 number
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { listExecutionLogs } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_list_logs_total";
const TEST_TEAM_SLUG = "list-logs-total-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const existing = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing.length > 0) {
    TEST_TEAM_ID = existing[0].id;
    return;
  }
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db
      .insert(user)
      .values({
        id: TEST_USER_ID,
        name: "List Logs Total",
        email: "list-logs-total@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "List Logs Total Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

await ensureTeam();

describe("listExecutionLogs total Number coercion", () => {
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

  // 无日志时 total 为 0（number）
  test("returns zero total when no logs exist", async () => {
    // 用一个真实的不存在的 UUID 作为 taskId
    const result = await listExecutionLogs("00000000-0000-0000-0000-000000000000");
    expect(result.data.total).toBe(0);
    expect(typeof result.data.total).toBe("number");
  });

  // 有日志时 total 为正确数量（number）
  test("returns correct numeric total", async () => {
    const [task] = await db
      .insert(scheduledTask)
      .values({
        userId: TEST_USER_ID,
        teamId: TEST_TEAM_ID!,
        name: `total_test_${Date.now()}`,
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

    // 插入 3 条日志（ID 用 UUID v4 格式）
    const { randomUUID } = await import("node:crypto");
    for (let i = 0; i < 3; i++) {
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
    }

    const result = await listExecutionLogs(task.id);
    expect(result.data.total).toBe(3);
    expect(typeof result.data.total).toBe("number");
  });
});
