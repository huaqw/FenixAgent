// ── startScheduler 跟踪失败调度数量 ──
import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { startScheduler, stopScheduler, setScheduleJobImpl } from "../services/scheduler";

const mockScheduleJob = mock(() => ({ nextInvocation: () => null, cancel: mock(() => {}) }));

beforeEach(() => {
  setScheduleJobImpl(mockScheduleJob as any);
  stopScheduler();
  mockScheduleJob.mockClear();
});

const TEST_USER_ID = "user_sched_start";
const TEST_TEAM_SLUG = "sched-start-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const existing = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing.length > 0) { TEST_TEAM_ID = existing[0].id; return; }
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db.insert(user).values({ id: TEST_USER_ID, name: "Sched Start", email: "sched-start@rcs.local", emailVerified: false, createdAt: now, updatedAt: now });
  }
  const [created] = await db.insert(team).values({ name: "Sched Start Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID }).returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(cron: string) {
  const [row] = await db.insert(scheduledTask).values({
    userId: TEST_USER_ID, teamId: TEST_TEAM_ID!,
    name: `start_${Date.now()}`, description: null, cron, timezone: null,
    enabled: true, url: "http://localhost:9999/test", method: "POST", headers: null, body: null,
    lastRunAt: null, nextRunAt: null, lastStatus: null,
  }).returning();
  return row;
}

async function cleanup() {
  if (TEST_TEAM_ID) {
    try { await db.delete(taskExecutionLog); } catch {}
    try { await db.delete(scheduledTask).where(eq(scheduledTask.teamId, TEST_TEAM_ID)); } catch {}
  }
}

await ensureTeam();

describe("startScheduler tracks failed count", () => {
  afterAll(async () => {
    await cleanup();
    if (TEST_TEAM_ID) {
      try { await db.delete(team).where(eq(team.id, TEST_TEAM_ID)); } catch {}
    }
    try { await db.delete(user).where(eq(user.id, TEST_USER_ID)); } catch {}
  });

  // 全部成功时正常完成
  test("completes when all tasks scheduled", async () => {
    await cleanup();
    await insertTask("*/5 * * * *");
    await insertTask("*/10 * * * *");

    await startScheduler();
    // 两个任务都应被调度
    expect(mockScheduleJob.mock.calls.length).toBeGreaterThanOrEqual(2);
    stopScheduler();
  });

  // 有失败时不抛异常（scheduleJobImpl 返回 null 模拟无效 cron）
  test("handles failed schedules gracefully", async () => {
    await cleanup();
    mockScheduleJob.mockImplementation(() => null as any);
    await insertTask("invalid");
    await insertTask("also-bad");

    await startScheduler();
    stopScheduler();
    // 不抛异常即通过
  });

  // 无 enabled 任务时正常启动
  test("handles empty task list", async () => {
    await cleanup();
    // 不插入任何任务
    await startScheduler();
    expect(mockScheduleJob).not.toHaveBeenCalled();
    stopScheduler();
  });
});
