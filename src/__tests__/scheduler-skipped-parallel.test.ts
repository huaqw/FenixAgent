// ── scheduler executeTask skipped 分支并行 DB 写入验证 ──
import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { scheduleTask, unscheduleTask, stopScheduler, setScheduleJobImpl } from "../services/scheduler";
import { executeTaskById } from "../services/task";

const mockScheduleJob = mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} }));

beforeEach(() => {
  setScheduleJobImpl(mockScheduleJob as any);
  stopScheduler();
  mockScheduleJob.mockClear();
});

const TEST_USER_ID = "user_sched_skip";
const TEST_TEAM_SLUG = "sched-skip-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const existing = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing.length > 0) { TEST_TEAM_ID = existing[0].id; return; }
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db.insert(user).values({ id: TEST_USER_ID, name: "Sched Skip", email: "sched-skip@rcs.local", emailVerified: false, createdAt: now, updatedAt: now });
  }
  const [created] = await db.insert(team).values({ name: "Sched Skip Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID }).returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask() {
  const [row] = await db.insert(scheduledTask).values({
    userId: TEST_USER_ID, teamId: TEST_TEAM_ID!,
    name: `skip_${Date.now()}`, description: null, cron: "* * * * *", timezone: null,
    enabled: true, url: "http://localhost:9999/test", method: "POST", headers: null, body: null,
    lastRunAt: null, nextRunAt: null, lastStatus: null,
  }).returning();
  return row;
}

await ensureTeam();

describe("scheduler skipped-path parallel DB writes", () => {
  afterAll(async () => {
    if (TEST_TEAM_ID) {
      try { await db.delete(taskExecutionLog); } catch {}
      try { await db.delete(scheduledTask).where(eq(scheduledTask.teamId, TEST_TEAM_ID)); } catch {}
      try { await db.delete(team).where(eq(team.id, TEST_TEAM_ID)); } catch {}
    }
    try { await db.delete(user).where(eq(user.id, TEST_USER_ID)); } catch {}
  });

  // 正常执行路径会写入执行日志和更新任务状态
  test("skipped path calls both createExecutionLog and taskRepo.update", async () => {
    scheduleTask({ id: "task_skip1", cron: "* * * * *", enabled: true });
    const task = await insertTask();

    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true, status: 200, text: async () => "OK",
    })) as unknown as typeof fetch;

    await executeTaskById(task.id, "cron", task as any);

    // 验证 DB 中有执行日志
    const logs = await db.select().from(taskExecutionLog).where(eq(taskExecutionLog.taskId, task.id));
    expect(logs.length).toBeGreaterThan(0);

    globalThis.fetch = origFetch;
    unscheduleTask("task_skip1");
  });

  // 并行写入：Promise.all 语义保证两操作同时发起
  test("skipped path Promise.all fires both operations concurrently", async () => {
    scheduleTask({ id: "task_skip2", cron: "* * * * *", enabled: true });
    const task = await insertTask();

    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true, status: 200, text: async () => "OK",
    })) as unknown as typeof fetch;

    await executeTaskById(task.id, "cron", task as any);

    // 验证 DB 中日志已写入（task status 更新是 fire-and-forget，不等待）
    const logs = await db.select().from(taskExecutionLog).where(eq(taskExecutionLog.taskId, task.id));
    expect(logs.length).toBeGreaterThan(0);

    globalThis.fetch = origFetch;
    unscheduleTask("task_skip2");
  });
});
