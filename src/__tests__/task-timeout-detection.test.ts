// ── executeTaskById timeout detection (AbortError + TimeoutError) 验证 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_task_timeout_det";
const TEST_TEAM_SLUG = "task-timeout-det-team";
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
        name: "Timeout Det",
        email: "timeout-det@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "Timeout Det Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(suffix: string) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `td_${suffix}_${Date.now()}`,
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

describe("executeTaskById timeout detection", () => {
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

  // AbortError 被识别为 timeout
  test("detects AbortError as timeout", async () => {
    const task = await insertTask("abort");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("timeout");
    }
    globalThis.fetch = origFetch;
  });

  // TimeoutError 被识别为 timeout
  test("detects TimeoutError as timeout", async () => {
    const task = await insertTask("to");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new DOMException("timeout", "TimeoutError");
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("timeout");
    }
    globalThis.fetch = origFetch;
  });

  // 通用 Error 不被识别为 timeout
  test("generic error is not timeout", async () => {
    const task = await insertTask("err");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("failed");
    }
    globalThis.fetch = origFetch;
  });
});
