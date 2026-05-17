import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── executeTaskById prefetchedTask 参数 + Content-Type 大小写不敏感 ──

const mockLogCreate = mock(async () => ({ id: "log_1" }));
const mockTaskUpdate = mock(async () => {});
const mockTaskGetById = mock(async (): Promise<any> => null);

mock.module("../repositories/task", () => ({
  scheduledTaskRepo: {
    listByUser: mock(async () => []),
    getById: mockTaskGetById,
    getByUserAndId: mock(async () => null),
    create: mock(async (d: any) => d),
    update: mockTaskUpdate,
    deleteByUserAndId: mock(async () => true),
    listEnabled: mock(async () => []),
  },
  taskExecutionLogRepo: {
    listByTask: mock(async () => []),
    listByTaskPaged: mock(async () => ({ rows: [], total: 0 })),
    create: mockLogCreate,
    deleteByTask: mock(async () => {}),
  },
}));
mock.module("../services/scheduler", () => ({
  scheduleTask: mock(() => {}),
  rescheduleTask: mock(() => {}),
  unscheduleTask: mock(() => {}),
}));

mock.module("../services/config/jsonb", () => ({
  parseJsonb: (v: unknown) => v,
}));

const { executeTaskById } = await import("../services/task");

describe("executeTaskById prefetchedTask parameter", () => {
  beforeEach(() => {
    mockLogCreate.mockClear();
    mockTaskUpdate.mockClear();
    mockTaskGetById.mockClear();
  });

  // 传入 prefetchedTask 时不再调用 getById
  test("uses prefetchedTask without calling getById", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    const prefetched = {
      id: "task_pf1",
      url: "http://localhost:9999/hook",
      method: "POST",
      headers: null,
      enabled: true,
    };

    const result = await executeTaskById("task_pf1", "manual", prefetched as any);

    expect(result.success).toBe(true);
    // getById 不应被调用
    expect(mockTaskGetById).not.toHaveBeenCalled();

    globalThis.fetch = origFetch;
  });

  // 不传 prefetchedTask 时照常调用 getById
  test("calls getById when prefetchedTask is undefined", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    })) as unknown as typeof fetch;

    mockTaskGetById.mockResolvedValueOnce({
      id: "task_nopf",
      url: "http://localhost:9999/direct",
      method: "POST",
      headers: null,
      enabled: true,
    });

    const result = await executeTaskById("task_nopf", "cron");

    expect(result.success).toBe(true);
    expect(mockTaskGetById).toHaveBeenCalledTimes(1);

    globalThis.fetch = origFetch;
  });

  // prefetchedTask 为 null 时（显式传入 undefined）仍回退到 getById
  test("falls back to getById when prefetchedTask is undefined and task not found", async () => {
    // getById 返回 null → NOT_FOUND
    mockTaskGetById.mockResolvedValueOnce(null);

    const result = await executeTaskById("task_missing", "manual");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });
});

describe("executeTaskById Content-Type case-insensitive check", () => {
  beforeEach(() => {
    mockLogCreate.mockClear();
    mockTaskUpdate.mockClear();
    mockTaskGetById.mockClear();
  });

  // 已有 content-type（小写）时不再追加 Content-Type
  test("does not add Content-Type when lowercase content-type exists", async () => {
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const prefetched = {
      id: "task_ct1",
      url: "http://localhost:9999/api",
      method: "POST",
      headers: { "content-type": "text/plain" },
      enabled: true,
    };

    const result = await executeTaskById("task_ct1", "manual", prefetched as any);

    expect(result.success).toBe(true);
    // 不应有重复的 Content-Type
    const headers = capturedHeaders[0];
    const ctKeys = Object.keys(headers).filter((k) => k.toLowerCase() === "content-type");
    expect(ctKeys.length).toBe(1);
    expect(headers[ctKeys[0]]).toBe("text/plain");

    globalThis.fetch = origFetch;
  });

  // 已有 Content-Type（标准大小写）时保持不变
  test("keeps existing Content-Type header as-is", async () => {
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const prefetched = {
      id: "task_ct2",
      url: "http://localhost:9999/api",
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      enabled: true,
    };

    const result = await executeTaskById("task_ct2", "manual", prefetched as any);

    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    expect(headers["Content-Type"]).toBe("application/xml");

    globalThis.fetch = origFetch;
  });

  // 无 Content-Type 时 POST 自动添加
  test("adds Content-Type application/json for POST without content-type", async () => {
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const prefetched = {
      id: "task_ct3",
      url: "http://localhost:9999/api",
      method: "POST",
      headers: {},
      enabled: true,
    };

    const result = await executeTaskById("task_ct3", "manual", prefetched as any);

    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    expect(headers["Content-Type"]).toBe("application/json");

    globalThis.fetch = origFetch;
  });

  // GET 请求不添加 Content-Type
  test("does not add Content-Type for GET requests", async () => {
    const origFetch = globalThis.fetch;
    const capturedHeaders: Record<string, string>[] = [];
    globalThis.fetch = mock(async (_url: any, opts: any) => {
      capturedHeaders.push({ ...opts.headers });
      return { ok: true, status: 200, text: async () => "OK" };
    }) as unknown as typeof fetch;

    const prefetched = {
      id: "task_ct4",
      url: "http://localhost:9999/api",
      method: "GET",
      headers: {},
      enabled: true,
    };

    const result = await executeTaskById("task_ct4", "manual", prefetched as any);

    expect(result.success).toBe(true);
    const headers = capturedHeaders[0];
    expect(headers["Content-Type"]).toBeUndefined();

    globalThis.fetch = origFetch;
  });
});
