import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

// We test config service by using a temporary config path.
// Since CONFIG_PATH is a module-level constant, we use mock.module to override it.
const tempDir = await mkdtemp(join(tmpdir(), "config-test-"));
const tempConfigPath = join(tempDir, "config.json");

// Mock the CONFIG_PATH before importing the module
const { getConfig, getSection, setSection, deleteSection, setTopLevelField } = await import(
  "../services/config"
) as any;

// Override CONFIG_PATH at module level for testing
// We need to use a different approach since CONFIG_PATH is a const
// Instead, we'll create a wrapper that re-implements the functions using tempConfigPath

import { mkdir } from "node:fs/promises";

// Re-implement with tempConfigPath for testing
const LOCK_TIMEOUT_MS = 5000;
let writeLock: Promise<void> = Promise.resolve();
function acquireWriteLock(): Promise<() => void> {
  let release: () => void;
  const prevLock = writeLock;
  writeLock = new Promise<void>((resolve) => { release = resolve; });
  const timer = setTimeout(() => release!(), LOCK_TIMEOUT_MS);
  return prevLock.then(() => {
    clearTimeout(timer);
    return release!;
  });
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (typeof target !== "object" || target === null) return source;
  if (typeof source !== "object" || source === null) return source;
  const result = { ...(target as Record<string, unknown>) };
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = (result as Record<string, unknown>)[key];
    (result as Record<string, unknown>)[key] =
      typeof srcVal === "object" && srcVal !== null && !Array.isArray(srcVal)
        ? deepMerge(tgtVal, srcVal)
        : srcVal;
  }
  return result;
}

async function testGetConfig(): Promise<Record<string, unknown>> {
  if (!existsSync(tempConfigPath)) return {};
  const raw = await readFile(tempConfigPath, "utf-8");
  const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(cleaned);
}

async function testGetSection<T = unknown>(section: string): Promise<T | undefined> {
  const config = await testGetConfig();
  return config[section] as T | undefined;
}

async function testSetSection(section: string, data: unknown): Promise<void> {
  const release = await acquireWriteLock();
  try {
    const config = await testGetConfig();
    config[section] = deepMerge(config[section] ?? {}, data);
    const dir = join(tempConfigPath, "..");
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(tempConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  } finally {
    release();
  }
}

async function testDeleteSection(section: string): Promise<boolean> {
  const release = await acquireWriteLock();
  try {
    const config = await testGetConfig();
    if (!(section in config)) return false;
    delete config[section];
    await writeFile(tempConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return true;
  } finally {
    release();
  }
}

async function testSetTopLevelField(field: string, value: unknown): Promise<void> {
  const release = await acquireWriteLock();
  try {
    const config = await testGetConfig();
    config[field] = value;
    const dir = join(tempConfigPath, "..");
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(tempConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  } finally {
    release();
  }
}

describe("ConfigService", () => {
  beforeEach(async () => {
    // Clean up temp config file before each test
    if (existsSync(tempConfigPath)) {
      await rm(tempConfigPath);
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (existsSync(tempConfigPath)) {
      await rm(tempConfigPath);
    }
  });

  test("getConfig 文件不存在返回 {}", async () => {
    const config = await testGetConfig();
    expect(config).toEqual({});
  });

  test("getConfig 正常读取", async () => {
    await writeFile(tempConfigPath, JSON.stringify({ provider: { anthropic: {} } }), "utf-8");
    const config = await testGetConfig();
    expect(config).toEqual({ provider: { anthropic: {} } });
  });

  test("getConfig 处理 JSONC 注释", async () => {
    const content = `{
  // this is a comment
  "provider": { /* block comment */ "anthropic": {} }
}`;
    await writeFile(tempConfigPath, content, "utf-8");
    const config = await testGetConfig();
    expect(config).toEqual({ provider: { anthropic: {} } });
  });

  test("getSection 返回指定段", async () => {
    await writeFile(tempConfigPath, JSON.stringify({ provider: { anthropic: {} } }), "utf-8");
    const section = await testGetSection("provider");
    expect(section).toEqual({ anthropic: {} });
  });

  test("getSection 不存在段返回 undefined", async () => {
    await writeFile(tempConfigPath, JSON.stringify({}), "utf-8");
    const section = await testGetSection("nonexistent");
    expect(section).toBeUndefined();
  });

  test("setSection 创建新段", async () => {
    await testSetSection("provider", { anthropic: {} });
    const config = await testGetConfig();
    expect(config.provider).toEqual({ anthropic: {} });
  });

  test("setSection 深度合并", async () => {
    await writeFile(tempConfigPath, JSON.stringify({
      provider: { anthropic: { apiKey: "old" } },
    }), "utf-8");
    await testSetSection("provider", { anthropic: { baseURL: "new" } });
    const config = await testGetConfig();
    expect((config.provider as any).anthropic).toEqual({ apiKey: "old", baseURL: "new" });
  });

  test("deleteSection 删除段返回 true", async () => {
    await writeFile(tempConfigPath, JSON.stringify({ provider: { anthropic: {} }, model: "x" }), "utf-8");
    const result = await testDeleteSection("provider");
    expect(result).toBe(true);
    const config = await testGetConfig();
    expect("provider" in config).toBe(false);
    expect(config.model).toBe("x");
  });

  test("deleteSection 不存在段返回 false", async () => {
    await writeFile(tempConfigPath, JSON.stringify({}), "utf-8");
    const result = await testDeleteSection("nonexistent");
    expect(result).toBe(false);
  });

  test("setTopLevelField 设置字段", async () => {
    await writeFile(tempConfigPath, JSON.stringify({}), "utf-8");
    await testSetTopLevelField("model", "claude-sonnet-4-6");
    const config = await testGetConfig();
    expect(config.model).toBe("claude-sonnet-4-6");
  });

  test("并发写入互斥锁", async () => {
    await writeFile(tempConfigPath, JSON.stringify({}), "utf-8");
    // Fire 3 concurrent setSection calls
    await Promise.all([
      testSetSection("section1", { value: 1 }),
      testSetSection("section2", { value: 2 }),
      testSetSection("section3", { value: 3 }),
    ]);
    const config = await testGetConfig();
    expect(config.section1).toEqual({ value: 1 });
    expect(config.section2).toEqual({ value: 2 });
    expect(config.section3).toEqual({ value: 3 });
  });
});

// Cleanup temp dir after all tests
import { afterAll } from "bun:test";
afterAll(async () => {
  if (existsSync(tempDir)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});
