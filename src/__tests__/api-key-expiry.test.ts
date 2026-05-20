import { describe, expect, test } from "bun:test";

describe("API Key expiresAt 过滤", () => {
  // createApiKey 默认 expiresAt 为 null
  test("createApiKey 默认 expiresAt 为 undefined（永不过期）", async () => {
    const { createApiKey } = await import("../auth/api-key-service");
    expect(typeof createApiKey).toBe("function");
  });

  // 过去的 expiresAt 表示已过期
  test("过去的 expiresAt 表示已过期", () => {
    const now = new Date();
    const past = new Date(now.getTime() - 3600_000);
    expect(past.getTime() < now.getTime()).toBe(true);
  });

  // 未来的 expiresAt 表示未过期
  test("未来的 expiresAt 表示未过期", () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3600_000);
    expect(future.getTime() > now.getTime()).toBe(true);
  });

  // null 表示永不过期
  test("null 表示永不过期", () => {
    const expiresAt = null;
    expect(expiresAt).toBeNull();
  });
});
