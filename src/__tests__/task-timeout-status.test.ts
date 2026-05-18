// ── executeTaskById timeout vs failed 状态区分 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_task_timeout_status";
const TEST_TEAM_SLUG = "task-timeout-status-team";
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
        name: "Timeout Status",
        email: "timeout-status@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "Timeout Status Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(suffix: string) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `to_${suffix}_${Date.now()}`,
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

describe("executeTaskById timeout status differentiation", () => {
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

  // fetch 抛出 AbortError 时状态为 "timeout"
  test("sets status to 'timeout' when fetch throws AbortError", async () => {
    const task = await insertTask("abort");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "cron");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("timeout");
    }
    globalThis.fetch = origFetch;
  });

  // fetch 抛出网络错误时状态为 "failed"
  test("sets status to 'failed' when fetch throws network error", async () => {
    const task = await insertTask("net");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("failed");
    }
    globalThis.fetch = origFetch;
  });

  // 非 DOMException 错误也标为 "failed"
  test("sets status to 'failed' for generic Error", async () => {
    const task = await insertTask("err");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      throw new Error("Connection refused");
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "cron");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("failed");
    }
    globalThis.fetch = origFetch;
  });
});
