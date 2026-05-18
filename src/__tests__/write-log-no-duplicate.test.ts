// ── writeLogAndReturn: task status update 失败不产生重复日志 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_write_log_nd";
const TEST_TEAM_SLUG = "write-log-nd-team";
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
        name: "WriteLog ND",
        email: "write-log-nd@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "WriteLog ND Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(suffix: string) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `nd_${suffix}_${Date.now()}`,
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

await ensureTeam();

describe("writeLogAndReturn: task status update failure", () => {
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

  // task status update 成功时正常返回，日志只写一条
  test("task status update success returns normally", async () => {
    const task = await insertTask("ok");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "cron", task as any);
    expect(result.success).toBe(true);

    // 验证 DB 中只有一条日志
    const logs = await db.select().from(taskExecutionLog).where(eq(taskExecutionLog.taskId, task.id));
    expect(logs.length).toBe(1);
    globalThis.fetch = origFetch;
  });

  // 执行成功（日志写入），task status update 是 fire-and-forget
  test("successful execution writes exactly one log", async () => {
    const task = await insertTask("dup");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "done",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);

    const logs = await db.select().from(taskExecutionLog).where(eq(taskExecutionLog.taskId, task.id));
    expect(logs.length).toBe(1);
    globalThis.fetch = origFetch;
  });

  // 日志创建失败时返回 WRITE_ERROR
  test("log creation failure returns WRITE_ERROR", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    // 传入不存在的 task ID → log create 因 FK 约束失败
    const fakeTask = {
      id: "00000000-0000-0000-0000-000000000002",
      userId: "u1",
      teamId: "t1",
      name: "fake",
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await executeTaskById("00000000-0000-0000-0000-000000000002", "manual", fakeTask as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("WRITE_ERROR");
    }
    globalThis.fetch = origFetch;
  });
});
