// ── writeLogAndReturn fire-and-forget 状态更新验证 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_write_log_ff";
const TEST_TEAM_SLUG = "write-log-ff-team";
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
        name: "WriteLog FF",
        email: "write-log-ff@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "WriteLog FF Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(suffix: string) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `ff_${suffix}_${Date.now()}`,
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

describe("writeLogAndReturn fire-and-forget status update", () => {
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

  // 执行成功后返回值不阻塞（fire-and-forget 状态更新不影响返回）
  test("returns success without waiting for status update", async () => {
    const task = await insertTask("fast");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("success");
    }
    globalThis.fetch = origFetch;
  });

  // 状态更新失败不影响返回值（fire-and-forget .catch 吞错）
  test("tolerates status update rejection", async () => {
    const task = await insertTask("reject");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "done",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "cron", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("success");
    }
    globalThis.fetch = origFetch;
  });

  // 日志写入失败仍返回 WRITE_ERROR（不受 fire-and-forget 影响）
  test("log creation failure still returns WRITE_ERROR", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    // 传入不存在的 task ID，log create 会因 FK 约束失败
    const fakeTask = {
      id: "00000000-0000-0000-0000-000000000001",
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

    const result = await executeTaskById("00000000-0000-0000-0000-000000000001", "manual", fakeTask as any);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("WRITE_ERROR");
    }
    globalThis.fetch = origFetch;
  });
});
