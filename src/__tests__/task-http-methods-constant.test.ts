// ── VALID_HTTP_METHODS 常量 + validateTaskInput 集成验证 ──
import { describe, test, expect, mock, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { createTask, updateTask } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_task_http_methods";
const TEST_TEAM_SLUG = "task-http-methods-team";
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
        name: "HTTP Methods",
        email: "http-methods@rcs.local",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
  }
  const [created] = await db
    .insert(team)
    .values({ name: "HTTP Methods Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function cleanupTasks() {
  if (TEST_TEAM_ID) {
    try {
      await db.delete(taskExecutionLog);
    } catch {}
    try {
      await db.delete(scheduledTask).where(eq(scheduledTask.teamId, TEST_TEAM_ID));
    } catch {}
  }
}

await ensureTeam();

describe("VALID_HTTP_METHODS constant usage", () => {
  beforeEach(async () => {
    await cleanupTasks();
  });

  afterAll(async () => {
    stopScheduler();
    await cleanupTasks();
    if (TEST_TEAM_ID) {
      try {
        await db.delete(team).where(eq(team.id, TEST_TEAM_ID));
      } catch {}
    }
    try {
      await db.delete(user).where(eq(user.id, TEST_USER_ID));
    } catch {}
  });

  // PATCH 是有效方法
  test("PATCH method accepted in createTask", async () => {
    const result = await createTask(
      TEST_TEAM_ID!,
      {
        name: "test-patch",
        cron: "0 * * * *",
        url: "http://example.com",
        method: "PATCH",
      },
      TEST_USER_ID,
    );
    expect(result.success).toBe(true);
  });

  // OPTIONS 是有效方法
  test("OPTIONS method accepted in updateTask", async () => {
    const created = await createTask(
      TEST_TEAM_ID!,
      {
        name: "test-options",
        cron: "0 * * * *",
        url: "http://example.com",
        method: "GET",
      },
      TEST_USER_ID,
    );
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await updateTask(TEST_TEAM_ID!, created.data.id, { method: "OPTIONS" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("OPTIONS");
    }
  });

  // 无效方法被拒绝
  test("invalid method rejected in createTask", async () => {
    const result = await createTask(
      TEST_TEAM_ID!,
      {
        name: "test-invalid",
        cron: "0 * * * *",
        url: "http://example.com",
        method: "INVALID",
      },
      TEST_USER_ID,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  // HEAD 是有效方法
  test("HEAD method accepted in createTask", async () => {
    const result = await createTask(
      TEST_TEAM_ID!,
      {
        name: "test-head",
        cron: "0 * * * *",
        url: "http://example.com",
        method: "HEAD",
      },
      TEST_USER_ID,
    );
    expect(result.success).toBe(true);
  });
});
