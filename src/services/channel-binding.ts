import { db } from "../db";
import { channelBinding } from "../db/schema";
import { eq, and } from "drizzle-orm";

// --- Types ---

export interface ChannelBinding {
  id: string;
  platform: string;
  chatId: string | null;
  agentId: string;
  enabled: boolean;
}

export interface CreateBindingInput {
  platform: string;
  chatId?: string | null;
  agentId: string;
  enabled?: boolean;
}

export interface BindingMatchResult {
  binding: ChannelBinding;
  matchType: "exact" | "wildcard";
}

// --- CRUD ---

export async function listBindings(): Promise<ChannelBinding[]> {
  const rows = await db.select().from(channelBinding);
  return rows.map(rowToBinding);
}

export async function getBinding(id: string): Promise<ChannelBinding | undefined> {
  const rows = await db.select().from(channelBinding).where(eq(channelBinding.id, id)).limit(1);
  return rows[0] ? rowToBinding(rows[0]) : undefined;
}

export async function createBinding(data: CreateBindingInput): Promise<ChannelBinding> {
  const now = new Date();
  const [row] = await db.insert(channelBinding).values({
    platform: data.platform,
    chatId: data.chatId ?? null,
    agentId: data.agentId,
    enabled: data.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return rowToBinding(row);
}

export async function deleteBinding(id: string): Promise<boolean> {
  const result = await db.delete(channelBinding).where(eq(channelBinding.id, id));
  return (result as any).count > 0;
}

export async function updateBinding(
  id: string,
  data: Partial<Pick<ChannelBinding, "platform" | "chatId" | "agentId" | "enabled">>,
): Promise<ChannelBinding | undefined> {
  const existing = await db.select().from(channelBinding).where(eq(channelBinding.id, id)).limit(1);
  if (existing.length === 0) return undefined;
  await db.update(channelBinding)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(channelBinding.id, id));
  return getBinding(id);
}

// --- Message Matching ---

export async function findBindingForMessage(
  platform: string,
  chatId: string,
): Promise<BindingMatchResult | undefined> {
  const rows = await db.select().from(channelBinding)
    .where(and(eq(channelBinding.platform, platform), eq(channelBinding.enabled, true)));

  const bindings = rows.map(rowToBinding);

  const exact = bindings.find((b) => b.chatId === chatId);
  if (exact) return { binding: exact, matchType: "exact" };

  const wildcard = bindings.find((b) => b.chatId === null);
  if (wildcard) return { binding: wildcard, matchType: "wildcard" };

  return undefined;
}

// --- Helper ---

function rowToBinding(row: typeof channelBinding.$inferSelect): ChannelBinding {
  return {
    id: row.id,
    platform: row.platform,
    chatId: row.chatId ?? null,
    agentId: row.agentId,
    enabled: row.enabled,
  };
}
