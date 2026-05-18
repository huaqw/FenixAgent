// ── scheduler executeTaskById prefetchedTask 验证 ──
import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { stopScheduler, setScheduleJobImpl } from "../services/scheduler";

const mockScheduleJob = mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} }));

beforeEach(() => {
  setScheduleJobImpl(mockScheduleJob as any);
  stopScheduler();
  mockScheduleJob.mockClear();
});

const TEST_USER_ID = "user_sched_prefetch";
const TEST_TEAM_SLUG = "sched-prefetch-team";
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
        name: "Sched Prefetch",
        email: "sched-prefetch@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "Sched Prefetch Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask() {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `prefetch_${Date.now()}`,
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

describe("scheduler→executeTaskById prefetchedTask pass-through", () => {
  afterAll(async () => {
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

  // executeTaskById 收到 prefetchedTask 时正常执行
  test("executeTaskById with prefetchedTask executes HTTP call", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    const task = await insertTask();
    const result = await executeTaskById(task.id, "cron", task as any);

    expect(result.success).toBe(true);
    globalThis.fetch = origFetch;
  });

  // 模拟 scheduler flow：检查 enabled 后传给 executeTaskById
  test("simulates scheduler flow: check enabled then execute", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "done",
    })) as unknown as typeof fetch;

    const task = await insertTask();
    expect(task.enabled).toBe(true);

    const result = await executeTaskById(task.id, "cron", task as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("success");
    }
    globalThis.fetch = origFetch;
  });
});
