// ── updateTask 使用 repo.update 返回值（消除冗余 getById 查询）──
import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { updateTask } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_update_no_rq";
const TEST_TEAM_SLUG = "update-no-rq-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db
      .insert(user)
      .values({
        id: TEST_USER_ID,
        name: "Update No RQ",
        email: "update-no-rq@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      })
      .catch(() => {});
  }
  const existing = await db.select().from(team).where(eq(team.slug, TEST_TEAM_SLUG)).limit(1);
  if (existing.length > 0) {
    TEST_TEAM_ID = existing[0].id;
    return;
  }
  const [created] = await db
    .insert(team)
    .values({ name: "Update No RQ Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask() {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `nq_${Date.now()}`,
      description: null,
      cron: "0 * * * *",
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

describe("updateTask uses repo.update return value", () => {
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

  // updateTask 返回更新后的值
  test("returns updated data from repo.update", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, {
      name: "updated-task",
      description: "updated desc",
      cron: "*/5 * * * *",
      url: "http://localhost:9999/updated",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("updated-task");
      expect(result.data.cron).toBe("*/5 * * * *");
    }
  });

  // updateTask 在任务不存在时返回 NOT_FOUND
  test("returns NOT_FOUND when task does not exist", async () => {
    const result = await updateTask(TEST_TEAM_ID!, "00000000-0000-0000-0000-000000000000", { name: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  // updateTask 正确传递更新字段
  test("passes correct update fields", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, {
      name: "new-name",
      url: "http://new-url",
      method: "PUT",
      enabled: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("new-name");
      expect(result.data.url).toBe("http://new-url");
      expect(result.data.method).toBe("PUT");
      expect(result.data.enabled).toBe(false);
    }
  });
});
