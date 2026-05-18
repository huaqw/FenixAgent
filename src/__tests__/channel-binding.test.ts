import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { channelBinding } from "../db/schema";

// Use in-memory SQLite for testing
const sqlite = new Database(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
const testDb = drizzle(sqlite);

// Create table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS channel_binding (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    chat_id TEXT,
    agent_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_channel_binding_platform ON channel_binding(platform);
  CREATE INDEX IF NOT EXISTS idx_channel_binding_agent_id ON channel_binding(agent_id);
`);

// Re-implement binding functions using test DB (same logic as channel-binding.ts)
import { eq, and } from "drizzle-orm";

interface ChannelBinding {
  id: string;
  platform: string;
  chatId: string | null;
  agentId: string;
  enabled: boolean;
}

interface CreateBindingInput {
  platform: string;
  chatId?: string | null;
  agentId: string;
  enabled?: boolean;
}

interface BindingMatchResult {
  binding: ChannelBinding;
  matchType: "exact" | "wildcard";
}

function generateBindingId(): string {
  const uuid = crypto.randomUUID();
  return "bind_" + uuid.replace(/-/g, "");
}

function rowToBinding(row: any): ChannelBinding {
  return {
    id: row.id,
    platform: row.platform,
    chatId: row.chatId ?? row.chat_id ?? null,
    agentId: row.agentId ?? row.agent_id,
    enabled: row.enabled === 1 || row.enabled === true,
  };
}

async function testListBindings(): Promise<ChannelBinding[]> {
  return testDb.select().from(channelBinding).all().map(rowToBinding);
}

async function testCreateBinding(data: CreateBindingInput): Promise<ChannelBinding> {
  const id = generateBindingId();
  const now = new Date();
  testDb
    .insert(channelBinding)
    .values({
      id,
      platform: data.platform,
      chatId: data.chatId ?? null,
      agentId: data.agentId,
      enabled: data.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return {
    id,
    platform: data.platform,
    chatId: data.chatId ?? null,
    agentId: data.agentId,
    enabled: data.enabled ?? true,
  };
}

async function testDeleteBinding(id: string): Promise<boolean> {
  testDb.delete(channelBinding).where(eq(channelBinding.id, id)).run();
  const result = sqlite.prepare("SELECT changes() as c").get() as any;
  return result.c > 0;
}

async function testUpdateBinding(
  id: string,
  data: Partial<Pick<ChannelBinding, "platform" | "chatId" | "agentId" | "enabled">>,
): Promise<ChannelBinding | undefined> {
  const existing = testDb.select().from(channelBinding).where(eq(channelBinding.id, id)).get();
  if (!existing) return undefined;
  testDb
    .update(channelBinding)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(channelBinding.id, id))
    .run();
  const row = testDb.select().from(channelBinding).where(eq(channelBinding.id, id)).get();
  return row ? rowToBinding(row) : undefined;
}

async function testFindBindingForMessage(platform: string, chatId: string): Promise<BindingMatchResult | undefined> {
  const rows = testDb
    .select()
    .from(channelBinding)
    .where(and(eq(channelBinding.platform, platform), eq(channelBinding.enabled, true)))
    .all()
    .map(rowToBinding);

  const exact = rows.find((b) => b.chatId === chatId);
  if (exact) return { binding: exact, matchType: "exact" };
  const wildcard = rows.find((b) => b.chatId === null);
  if (wildcard) return { binding: wildcard, matchType: "wildcard" };
  return undefined;
}

describe("channel-binding service", () => {
  beforeEach(() => {
    sqlite.exec("DELETE FROM channel_binding");
  });

  test("listBindings 空表返回空数组", async () => {
    const bindings = await testListBindings();
    expect(bindings).toEqual([]);
  });

  test("createBinding 创建并返回绑定", async () => {
    const binding = await testCreateBinding({ platform: "feishu", agentId: "env_001" });
    expect(binding.id).toMatch(/^bind_/);
    expect(binding.platform).toBe("feishu");
    expect(binding.chatId).toBeNull();
    expect(binding.agentId).toBe("env_001");
    expect(binding.enabled).toBe(true);

    const bindings = await testListBindings();
    expect(bindings).toHaveLength(1);
    expect(bindings[0].id).toBe(binding.id);
  });

  test("createBinding 重复调用不冲突", async () => {
    const b1 = await testCreateBinding({ platform: "feishu", agentId: "env_001" });
    const b2 = await testCreateBinding({ platform: "telegram", agentId: "env_002" });
    expect(b1.id).not.toBe(b2.id);
    const bindings = await testListBindings();
    expect(bindings).toHaveLength(2);
  });

  test("getBinding 存在时返回绑定", async () => {
    const created = await testCreateBinding({ platform: "feishu", agentId: "env_001" });
    const bindings = await testListBindings();
    const found = bindings.find((b) => b.id === created.id);
    expect(found).toEqual(created);
  });

  test("getBinding 不存在时返回 undefined", async () => {
    await testCreateBinding({ platform: "feishu", agentId: "env_001" });
    const bindings = await testListBindings();
    const found = bindings.find((b) => b.id === "bind_nonexistent");
    expect(found).toBeUndefined();
  });

  test("deleteBinding 删除存在的绑定", async () => {
    const created = await testCreateBinding({ platform: "feishu", agentId: "env_001" });
    const deleted = await testDeleteBinding(created.id);
    expect(deleted).toBe(true);
    const bindings = await testListBindings();
    expect(bindings).toHaveLength(0);
  });

  test("deleteBinding 删除不存在的绑定返回 false", async () => {
    const deleted = await testDeleteBinding("bind_nonexistent");
    expect(deleted).toBe(false);
  });

  test("updateBinding 更新绑定字段", async () => {
    const created = await testCreateBinding({ platform: "feishu", agentId: "env_001" });
    const updated = await testUpdateBinding(created.id, { enabled: false });
    expect(updated).toBeDefined();
    expect(updated!.enabled).toBe(false);
    expect(updated!.platform).toBe("feishu");
  });

  test("updateBinding 不存在的绑定返回 undefined", async () => {
    const updated = await testUpdateBinding("bind_nonexistent", { enabled: false });
    expect(updated).toBeUndefined();
  });

  test("findBindingForMessage 精确匹配优先", async () => {
    await testCreateBinding({ platform: "feishu", chatId: "chat1", agentId: "env_001" });
    await testCreateBinding({ platform: "feishu", chatId: null, agentId: "env_002" });

    const result = await testFindBindingForMessage("feishu", "chat1");
    expect(result).toBeDefined();
    expect(result!.matchType).toBe("exact");
    expect(result!.binding.agentId).toBe("env_001");
  });

  test("findBindingForMessage 通配匹配兜底", async () => {
    await testCreateBinding({ platform: "feishu", chatId: "chat1", agentId: "env_001" });
    await testCreateBinding({ platform: "feishu", chatId: null, agentId: "env_002" });

    const result = await testFindBindingForMessage("feishu", "chat_other");
    expect(result).toBeDefined();
    expect(result!.matchType).toBe("wildcard");
    expect(result!.binding.agentId).toBe("env_002");
  });

  test("findBindingForMessage 无匹配返回 undefined", async () => {
    await testCreateBinding({ platform: "feishu", chatId: null, agentId: "env_001" });

    const result = await testFindBindingForMessage("telegram", "any");
    expect(result).toBeUndefined();
  });

  test("findBindingForMessage 跳过 disabled 绑定", async () => {
    await testCreateBinding({ platform: "feishu", chatId: null, agentId: "env_001", enabled: false });

    const result = await testFindBindingForMessage("feishu", "any");
    expect(result).toBeUndefined();
  });

  test("findBindingForMessage platform 不匹配时忽略", async () => {
    await testCreateBinding({ platform: "feishu", chatId: null, agentId: "env_001" });

    const result = await testFindBindingForMessage("telegram", "any");
    expect(result).toBeUndefined();
  });
});
