// ── validateTaskInput 泛型签名（不再需要 as CreateTaskInput）──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { updateTask, createTask } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_validate_partial";
const TEST_TEAM_SLUG = "validate-partial-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db
      .insert(user)
      .values({
        id: TEST_USER_ID,
        name: "Validate Partial",
        email: "validate-partial@rcs.local",
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
    .values({ name: "Validate Partial Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask() {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `vp_${Date.now()}`,
      description: null,
      cron: "0 * * * *",
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

describe("validateTaskInput accepts partial without cast", () => {
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

  // updateTask 接受 Partial<CreateTaskInput>，不需要提供所有字段
  test("updateTask validates partial data without cast", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { name: "updated" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("updated");
    }
  });

  // 只更新 enabled 字段
  test("updateTask accepts enabled-only update", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { enabled: false });
    expect(result.success).toBe(true);
  });

  // 空对象 update 通过验证
  test("updateTask accepts empty update", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, {});
    expect(result.success).toBe(true);
  });

  // 部分字段验证：只提供 method
  test("updateTask validates method field only", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { method: "DELETE" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("DELETE");
    }
  });

  // 验证失败：空 method 字符串
  test("updateTask rejects empty method string", async () => {
    const task = await insertTask();
    const result = await updateTask(TEST_TEAM_ID!, task.id, { method: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  // createTask 仍需要完整字段
  test("createTask requires full input", async () => {
    const result = await createTask(
      TEST_TEAM_ID!,
      {
        name: "new-task",
        cron: "*/10 * * * *",
        url: "http://localhost:9999/hook",
        method: "POST",
      },
      TEST_USER_ID,
    );
    expect(result.success).toBe(true);
  });
});
