// ── executeTaskById prefetchedTask 参数 + Content-Type 大小写不敏感 ──
import { describe, test, expect, mock, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { scheduledTask, taskExecutionLog, team, user } from "../db/schema";
import { executeTaskById } from "../services/task";
import { setScheduleJobImpl, stopScheduler } from "../services/scheduler";

setScheduleJobImpl(mock(() => ({ nextInvocation: () => new Date(), cancel: () => {} })) as any);

const TEST_USER_ID = "user_task_prefetch_ct";
const TEST_TEAM_SLUG = "task-prefetch-ct-team";
let TEST_TEAM_ID: string | undefined;

async function ensureTeam() {
  const now = new Date();
  const existingUser = await db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    await db
      .insert(user)
      .values({
        id: TEST_USER_ID,
        name: "Prefetch CT",
        email: "prefetch-ct@rcs.local",
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
    .values({ name: "Prefetch CT Team", slug: TEST_TEAM_SLUG, createdBy: TEST_USER_ID })
    .returning();
  TEST_TEAM_ID = created.id;
}

async function insertTask(suffix: string, method: string = "POST", headersVal: Record<string, string> | null = null) {
  const [row] = await db
    .insert(scheduledTask)
    .values({
      userId: TEST_USER_ID,
      teamId: TEST_TEAM_ID!,
      name: `pc_${suffix}_${Date.now()}`,
      description: null,
      cron: "* * * * *",
      timezone: null,
      enabled: true,
      url: "http://localhost:9999/test",
      method,
      headers: headersVal,
      body: null,
      lastRunAt: null,
      nextRunAt: null,
      lastStatus: null,
    })
    .returning();
  return row;
}

const { randomUUID } = await import("node:crypto");
await ensureTeam();

describe("executeTaskById prefetchedTask + Content-Type", () => {
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

  // 传入 prefetchedTask 时正常执行
  test("uses prefetchedTask without calling getById", async () => {
    const task = await insertTask("pf");
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    globalThis.fetch = origFetch;
  });

  // 不传 prefetchedTask 且 DB 中无任务时返回 NOT_FOUND
  test("returns NOT_FOUND when prefetchedTask is undefined and task not in DB", async () => {
    const result = await executeTaskById(randomUUID(), "manual");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  // 已有 content-type（小写）时不再追加 Content-Type
  test("does not add Content-Type when lowercase content-type exists", async () => {
    const task = await insertTask("ct1", "POST", { "content-type": "text/plain" });
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    const ctKeys = Object.keys(headers).filter((k) => k.toLowerCase() === "content-type");
    expect(ctKeys.length).toBe(1);
    expect(headers[ctKeys[0]]).toBe("text/plain");
    globalThis.fetch = origFetch;
  });

  // 已有 Content-Type（标准大小写）时保持不变
  test("keeps existing Content-Type header as-is", async () => {
    const task = await insertTask("ct2", "POST", { "Content-Type": "application/xml" });
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    expect(headers["Content-Type"]).toBe("application/xml");
    globalThis.fetch = origFetch;
  });

  // 无 Content-Type 时 POST 自动添加
  test("adds Content-Type application/json for POST without content-type", async () => {
    const task = await insertTask("ct3", "POST", {});
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    expect(headers["Content-Type"]).toBe("application/json");
    globalThis.fetch = origFetch;
  });

  // GET 请求不添加 Content-Type
  test("does not add Content-Type for GET requests", async () => {
    const task = await insertTask("ct4", "GET", {});
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const result = await executeTaskById(task.id, "manual", task as any);
    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    expect(headers["Content-Type"]).toBeUndefined();
    globalThis.fetch = origFetch;
  });
});
