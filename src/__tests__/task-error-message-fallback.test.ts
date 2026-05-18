// ── executeTaskById HTTP error message fallback 验证 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_task_err_msg";
const TEST_TEAM_SLUG = "task-err-msg-team";
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
        name: "Task Err Msg",
        email: "task-err-msg@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "Task Err Msg Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(suffix: string) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `em_${suffix}_${Date.now()}`,
      description: null,
      cron: "* * * * *",
      timezone: null,
      enabled: true,
      url: "http://localhost:9999/test",
      method: "GET",
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

describe("executeTaskById HTTP error message", () => {
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

  // 有 body 的 HTTP 错误保留原始格式
  test("error with body includes response text", async () => {
    const task = await insertTask("body");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("HTTP 500: Internal Server Error");
    }
    globalThis.fetch = origFetch;
  });

  // 空 body 的 HTTP 错误不留尾部冒号
  test("error with empty body shows status only", async () => {
    const task = await insertTask("empty");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 502,
      text: async () => "",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("HTTP 502");
      expect(result.data.error).not.toMatch(/: $/);
    }
    globalThis.fetch = origFetch;
  });

  // text() 抛出异常时 fallback 为空
  test("error when text() throws shows status only", async () => {
    const task = await insertTask("throw");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 503,
      text: async () => {
        throw new Error("stream error");
      },
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("HTTP 503");
    }
    globalThis.fetch = origFetch;
  });

  // 成功响应 error 为 null
  test("successful response has null error", async () => {
    const task = await insertTask("ok");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBeNull();
      expect(result.data.status).toBe("success");
    }
    globalThis.fetch = origFetch;
  });
});
