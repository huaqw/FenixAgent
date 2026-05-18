import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { apiKey } from "../db/schema";
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "rcs_";

function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

function generateId(): string {
  return `key_${randomBytes(12).toString("hex")}`;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  key: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface ApiKeySanitized {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

function sanitize(record: ApiKeyRecord): ApiKeySanitized {
  return {
    id: record.id,
    label: record.label,
    keyPrefix: record.key.slice(0, 8) + "..." + record.key.slice(-4),
    createdAt: Math.floor(record.createdAt.getTime() / 1000),
    lastUsedAt: record.lastUsedAt ? Math.floor(record.lastUsedAt.getTime() / 1000) : null,
  };
}

export async function createApiKey(
  userId: string,
  label: string,
  teamId: string,
): Promise<{ record: ApiKeySanitized; fullKey: string }> {
  const fullKey = generateApiKey();
  const now = new Date();

  const [row] = await db
    .insert(apiKey)
    .values({
      userId,
      teamId,
      key: fullKey,
      label: label || "Default",
      createdAt: now,
      lastUsedAt: null,
    })
    .returning();

  const record: ApiKeyRecord = {
    id: row.id,
    userId,
    key: fullKey,
    label: label || "Default",
    createdAt: now,
    lastUsedAt: null,
  };

  return { record: sanitize(record), fullKey };
}

export async function validateApiKeyAndGetUser(
  key: string,
): Promise<{ userId: string; keyId: string; teamId: string | null } | null> {
  const rows = await db.select().from(apiKey).where(eq(apiKey.key, key)).limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];

  // Update lastUsedAt in background (fire-and-forget)
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, row.id))
    .then(() => {})
    .catch(() => {});

  return { userId: row.userId, keyId: row.id, teamId: row.teamId ?? null };
}

export async function listApiKeysByUser(teamId: string): Promise<ApiKeySanitized[]> {
  const rows = await db.select().from(apiKey).where(eq(apiKey.teamId, teamId));

  return rows.map((r) =>
    sanitize({
      id: r.id,
      userId: r.userId,
      key: r.key,
      label: r.label,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    }),
  );
}

export async function deleteApiKey(teamId: string, keyId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.teamId, teamId)));

  if (!existing) return false;

  await db.delete(apiKey).where(and(eq(apiKey.id, keyId), eq(apiKey.teamId, teamId)));
  return true;
}

export async function updateApiKeyLabel(teamId: string, keyId: string, label: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.teamId, teamId)));

  if (!existing) return false;

  await db
    .update(apiKey)
    .set({ label })
    .where(and(eq(apiKey.id, keyId), eq(apiKey.teamId, teamId)));
  return true;
}

/** Hash an API key with SHA-256 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
