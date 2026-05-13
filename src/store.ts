import { v4 as uuid } from "uuid";
import { db } from "./db";
import { environment, user, shareLink, shareEventSnapshot, agentSession } from "./db/schema";
import { eq, and, sql } from "drizzle-orm";

// ---------- Types ----------

export interface EnvironmentRecord {
  id: string;
  name: string;
  description: string | null;
  workspacePath: string;
  agentName: string | null;
  secret: string;
  machineName: string | null;
  directory: string | null;
  branch: string | null;
  gitRepoUrl: string | null;
  maxSessions: number;
  workerType: string;
  capabilities: Record<string, unknown> | null;
  status: string;
  username: string | null;
  userId: string | null;
  autoStart: boolean;
  lastPollAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  environmentId: string | null;
  title: string | null;
  status: string;
  source: string;
  permissionMode: string | null;
  workerEpoch: number;
  username: string | null;
  userId: string | null;
  cwd: string | null;
  shareMode: "none" | "readonly" | "writable";
  createdAt: Date;
  updatedAt: Date;
}

// ---------- Stores (in-memory Maps) ----------

const sessions = new Map<string, SessionRecord>();

// ---------- Environment (PostgreSQL) ----------

function rowToRecord(row: typeof environment.$inferSelect): EnvironmentRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workspacePath: row.workspacePath,
    agentName: row.agentName,
    secret: row.secret,
    machineName: row.machineName,
    directory: row.workspacePath,
    branch: row.branch,
    gitRepoUrl: row.gitRepoUrl,
    maxSessions: row.maxSessions,
    workerType: row.workerType,
    capabilities: (row.capabilities as Record<string, unknown>) ?? null,
    status: row.status,
    username: null,
    userId: row.userId,
    autoStart: row.autoStart ?? false,
    lastPollAt: row.lastPollAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function storeCreateEnvironment(req: {
  name?: string;
  description?: string;
  workspacePath?: string;
  agentName?: string;
  secret?: string;
  userId: string;
  status?: string;
  machineName?: string;
  directory?: string;
  branch?: string;
  gitRepoUrl?: string;
  maxSessions?: number;
  workerType?: string;
  username?: string;
  capabilities?: Record<string, unknown>;
  autoStart?: boolean;
}): Promise<EnvironmentRecord> {
  const id = `env_${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const name = req.name || `env-${id.slice(4, 12)}`;
  const workspacePath = req.workspacePath || req.directory || "/tmp";
  const status = req.status || "active";
  const secret = req.secret || `sec_${uuid().replace(/-/g, "")}`;
  await db.insert(environment).values({
    id,
    name,
    description: req.description ?? null,
    workspacePath,
    agentName: req.agentName ?? null,
    secret,
    machineName: req.machineName ?? null,
    branch: req.branch ?? null,
    gitRepoUrl: req.gitRepoUrl ?? null,
    maxSessions: req.maxSessions ?? 1,
    workerType: req.workerType ?? "acp",
    capabilities: req.capabilities ?? null,
    status,
    userId: req.userId,
    autoStart: req.autoStart ?? false,
    lastPollAt: now,
  });
  return {
    id, name, description: req.description ?? null, workspacePath,
    agentName: req.agentName ?? null, secret,
    machineName: req.machineName ?? null, directory: req.directory ?? null,
    branch: req.branch ?? null, gitRepoUrl: req.gitRepoUrl ?? null,
    maxSessions: req.maxSessions ?? 1, workerType: req.workerType ?? "acp",
    capabilities: req.capabilities ?? null, status,
    username: req.username ?? null, userId: req.userId,
    autoStart: req.autoStart ?? false,
    lastPollAt: now, createdAt: now, updatedAt: now,
  };
}

export async function storeGetEnvironment(id: string): Promise<EnvironmentRecord | undefined> {
  const rows = await db.select().from(environment).where(eq(environment.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : undefined;
}

export async function storeGetEnvironmentBySecret(secret: string): Promise<EnvironmentRecord | undefined> {
  const rows = await db.select().from(environment).where(eq(environment.secret, secret)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : undefined;
}

export async function storeUpdateEnvironment(id: string, patch: Partial<Pick<EnvironmentRecord, "status" | "lastPollAt" | "updatedAt" | "capabilities" | "machineName" | "maxSessions" | "name" | "description" | "workspacePath" | "agentName" | "branch" | "gitRepoUrl" | "autoStart">>): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.lastPollAt !== undefined) set.lastPollAt = patch.lastPollAt;
  if (patch.capabilities !== undefined) set.capabilities = patch.capabilities ?? null;
  if (patch.machineName !== undefined) set.machineName = patch.machineName;
  if (patch.maxSessions !== undefined) set.maxSessions = patch.maxSessions;
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.workspacePath !== undefined) set.workspacePath = patch.workspacePath;
  if (patch.agentName !== undefined) set.agentName = patch.agentName;
  if (patch.branch !== undefined) set.branch = patch.branch;
  if (patch.gitRepoUrl !== undefined) set.gitRepoUrl = patch.gitRepoUrl;
  if (patch.autoStart !== undefined) set.autoStart = patch.autoStart;
  const result = await db.update(environment).set(set).where(eq(environment.id, id));
  return (result as any).count > 0;
}

export async function storeListActiveEnvironments(): Promise<EnvironmentRecord[]> {
  const rows = await db.select().from(environment).where(eq(environment.status, "active"));
  return rows.map(rowToRecord);
}

export async function storeListAllEnvironments(): Promise<EnvironmentRecord[]> {
  const rows = await db.select().from(environment);
  return rows.map(rowToRecord);
}

export async function storeListEnvironmentsByUserId(userId: string): Promise<EnvironmentRecord[]> {
  const rows = await db.select().from(environment).where(eq(environment.userId, userId));
  return rows.map(rowToRecord);
}

export async function storeListActiveEnvironmentsByUsername(username: string): Promise<EnvironmentRecord[]> {
  const userRow = await db.select().from(user).where(eq(user.name, username)).limit(1);
  if (userRow.length === 0) return [];
  const rows = await db.select().from(environment).where(and(eq(environment.status, "active"), eq(environment.userId, userRow[0].id)));
  return rows.map(rowToRecord);
}

// ---------- Session ----------

export async function storeCreateSession(req: {
  environmentId?: string | null;
  title?: string | null;
  source?: string;
  permissionMode?: string | null;
  idPrefix?: string;
  username?: string | null;
  userId?: string | null;
  cwd?: string | null;
}): Promise<SessionRecord> {
  const id = `${req.idPrefix || "session_"}${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const record: SessionRecord = {
    id,
    environmentId: req.environmentId ?? null,
    title: req.title ?? null,
    status: "idle",
    source: req.source ?? "acp",
    permissionMode: req.permissionMode ?? null,
    workerEpoch: 0,
    username: req.username ?? null,
    userId: req.userId ?? null,
    cwd: req.cwd ?? null,
    shareMode: "none" as const,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(id, record);
  await db.insert(agentSession).values({
    id,
    environmentId: record.environmentId,
    title: record.title,
    status: record.status,
    source: record.source,
    permissionMode: record.permissionMode,
    workerEpoch: record.workerEpoch,
    username: record.username,
    userId: record.userId,
    cwd: record.cwd,
    shareMode: record.shareMode,
  });
  return record;
}

export function storeGetSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export async function storeUpdateSession(id: string, patch: Partial<Pick<SessionRecord, "title" | "status" | "workerEpoch" | "updatedAt">>): Promise<boolean> {
  const rec = sessions.get(id);
  if (!rec) return false;
  Object.assign(rec, patch, { updatedAt: new Date() });
  const dbSet: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) dbSet.title = patch.title;
  if (patch.status !== undefined) dbSet.status = patch.status;
  if (patch.workerEpoch !== undefined) dbSet.workerEpoch = patch.workerEpoch;
  await db.update(agentSession).set(dbSet).where(eq(agentSession.id, id));
  return true;
}

export function storeListSessions(): SessionRecord[] {
  return [...sessions.values()];
}

export function storeListSessionsByEnvironment(envId: string): SessionRecord[] {
  return [...sessions.values()].filter((s) => s.environmentId === envId);
}

export function storeListSessionsByUserId(userId: string): SessionRecord[] {
  return [...sessions.values()].filter((s) => s.userId === userId);
}

export function storeListSessionsForAgentByCwd(agentId: string, cwd?: string): SessionRecord[] {
  const env = sessions.get(agentId); // Note: this is a session lookup, not environment — kept as-is for compatibility
  // This function is used in the codebase as-is; the env lookup below uses storeGetEnvironment synchronously
  // which is not possible anymore. The caller should handle async.
  // For now, keep the sync behavior but note that storeGetEnvironment is async.
  // The actual callers of this function in the codebase use it synchronously, so we need to maintain compatibility.
  // The function signature cannot change to async since it's used in WebSocket handlers.
  // We'll return based on in-memory sessions only.
  return storeListSessionsByEnvironment(agentId);
}

export async function storeDeleteSession(id: string): Promise<boolean> {
  await db.delete(agentSession).where(eq(agentSession.id, id));
  return sessions.delete(id);
}

/** Load all sessions from PostgreSQL into the in-memory sessions Map (called at startup) */
export async function storeLoadSessionsFromDB(): Promise<void> {
  const rows = await db.select().from(agentSession);
  for (const row of rows) {
    sessions.set(row.id, {
      id: row.id,
      environmentId: row.environmentId,
      title: row.title,
      status: row.status,
      source: row.source,
      permissionMode: row.permissionMode,
      workerEpoch: row.workerEpoch,
      username: row.username,
      userId: row.userId,
      cwd: row.cwd,
      shareMode: (row.shareMode as "none" | "readonly" | "writable") ?? "none",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

// ---------- Share Link ----------

export async function storeCreateShareLink(
  sessionId: string,
  environmentId: string,
  mode: string,
  expiresAt: Date | null,
  createdBy: string,
) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = new Date();
  const [row] = await db.insert(shareLink).values({
    sessionId,
    environmentId,
    token,
    mode: mode as "readonly" | "writable",
    expiresAt,
    createdBy,
    accessCount: 0,
    lastAccessedAt: null,
  }).returning();
  return { id: row.id, sessionId, environmentId, token, mode, expiresAt, createdBy, accessCount: 0, lastAccessedAt: null as Date | null, createdAt: now, updatedAt: now };
}

export async function storeGetShareLink(id: string) {
  const rows = await db.select().from(shareLink).where(eq(shareLink.id, id)).limit(1);
  return rows[0] ?? undefined;
}

export async function storeGetShareLinkByToken(token: string) {
  const rows = await db.select().from(shareLink).where(eq(shareLink.token, token)).limit(1);
  return rows[0] ?? undefined;
}

export async function storeListShareLinksBySession(sessionId: string) {
  return db.select().from(shareLink).where(eq(shareLink.sessionId, sessionId));
}

export async function storeDeleteShareLink(id: string): Promise<boolean> {
  const result = await db.delete(shareLink).where(eq(shareLink.id, id));
  return (result as any).count > 0;
}

export async function storeUpdateShareLinkAccess(id: string): Promise<void> {
  await db.update(shareLink).set({
    accessCount: sql`${shareLink.accessCount} + 1`,
    lastAccessedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(shareLink.id, id));
}

export async function storeRefreshSessionShareMode(sessionId: string): Promise<void> {
  const links = await db.select().from(shareLink).where(eq(shareLink.sessionId, sessionId));
  const now = Date.now();
  let mode: "none" | "readonly" | "writable" = "none";
  for (const link of links) {
    const expired = link.expiresAt !== null && link.expiresAt.getTime() < now;
    if (!expired) {
      if (link.mode === "writable") { mode = "writable"; break; }
      if (link.mode === "readonly" && mode === "none") { mode = "readonly"; }
    }
  }
  const rec = sessions.get(sessionId);
  if (rec) rec.shareMode = mode;
  await db.update(agentSession).set({ shareMode: mode, updatedAt: new Date() }).where(eq(agentSession.id, sessionId));
}

// ---------- Share Event Snapshot ----------

/** Persist an event snapshot for a share link (overwrites previous) */
export async function storeSaveEventSnapshot(shareLinkId: string, events: unknown): Promise<void> {
  await db.delete(shareEventSnapshot).where(eq(shareEventSnapshot.shareLinkId, shareLinkId));
  await db.insert(shareEventSnapshot).values({
    shareLinkId,
    events,
  });
}

/** Load the event snapshot for a share link (returns null if none) */
export async function storeGetEventSnapshot(shareLinkId: string): Promise<unknown | null> {
  const rows = await db.select({ events: shareEventSnapshot.events })
    .from(shareEventSnapshot)
    .where(eq(shareEventSnapshot.shareLinkId, shareLinkId))
    .limit(1);
  return rows.length > 0 ? rows[0].events : null;
}

// ---------- Session Ownership (UUID-based) ----------

const sessionOwners = new Map<string, Set<string>>();

export function storeBindSession(sessionId: string, uuid: string): void {
  if (!sessionOwners.has(sessionId)) {
    sessionOwners.set(sessionId, new Set());
  }
  sessionOwners.get(sessionId)!.add(uuid);
}

export function storeIsSessionOwner(sessionId: string, uuid: string): boolean {
  return sessionOwners.get(sessionId)?.has(uuid) ?? false;
}

export function storeGetSessionOwners(sessionId: string): Set<string> | undefined {
  return sessionOwners.get(sessionId);
}

export function storeListSessionsByOwnerUuid(uuid: string): SessionRecord[] {
  const ownedIds = new Set<string>();
  for (const [sid, owners] of sessionOwners) {
    if (owners.has(uuid)) ownedIds.add(sid);
  }
  return [...sessions.values()].filter((s) => ownedIds.has(s.id));
}

export function storeListSessionsByUsername(username: string): SessionRecord[] {
  return [...sessions.values()].filter((s) => s.username === username);
}

// ---------- Work Items ----------

export interface WorkItemRecord {
  id: string;
  environmentId: string;
  sessionId: string;
  secret: string;
  state: string;
  createdAt: Date;
  updatedAt: Date;
}

const workItems = new Map<string, WorkItemRecord>();

export function storeCreateWorkItem(req: {
  environmentId: string;
  sessionId: string;
  secret: string;
}): WorkItemRecord {
  const id = `work_${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const record: WorkItemRecord = {
    id,
    environmentId: req.environmentId,
    sessionId: req.sessionId,
    secret: req.secret,
    state: "pending",
    createdAt: now,
    updatedAt: now,
  };
  workItems.set(id, record);
  return record;
}

export function storeGetWorkItem(id: string): WorkItemRecord | undefined {
  return workItems.get(id);
}

export function storeGetPendingWorkItem(environmentId: string): WorkItemRecord | undefined {
  for (const item of workItems.values()) {
    if (item.environmentId === environmentId && item.state === "pending") {
      return item;
    }
  }
  return undefined;
}

export function storeUpdateWorkItem(id: string, patch: Partial<Pick<WorkItemRecord, "state">>): boolean {
  const item = workItems.get(id);
  if (!item) return false;
  Object.assign(item, patch, { updatedAt: new Date() });
  return true;
}

/** Delete an environment and disassociate its sessions */
export async function storeDeleteEnvironment(id: string): Promise<boolean> {
  for (const s of sessions.values()) {
    if (s.environmentId === id) {
      s.environmentId = null;
      await db.update(agentSession).set({ environmentId: null, updatedAt: new Date() }).where(eq(agentSession.id, s.id));
    }
  }
  const result = await db.delete(environment).where(eq(environment.id, id));
  return (result as any).count > 0;
}

// ---------- ACP Agent (reuses EnvironmentRecord with workerType="acp") ----------

/** List all ACP agents (environments with workerType="acp") */
export async function storeListAcpAgents(): Promise<EnvironmentRecord[]> {
  const rows = await db.select().from(environment).where(eq(environment.workerType, "acp"));
  return rows.map(rowToRecord);
}

/** List ACP agents for a specific user */
export async function storeListAcpAgentsByUserId(userId: string): Promise<EnvironmentRecord[]> {
  const rows = await db.select().from(environment).where(and(eq(environment.workerType, "acp"), eq(environment.userId, userId)));
  return rows.map(rowToRecord);
}

/** List online ACP agents */
export async function storeListOnlineAcpAgents(): Promise<EnvironmentRecord[]> {
  const rows = await db.select().from(environment).where(and(eq(environment.workerType, "acp"), eq(environment.status, "active")));
  return rows.map(rowToRecord);
}

// ---------- Session Workers ----------

export interface SessionWorkerRecord {
  sessionId: string;
  workerStatus: string | null;
  externalMetadata: Record<string, unknown> | null;
  requiresActionDetails: Record<string, unknown> | null;
  lastHeartbeatAt: Date | null;
}

const sessionWorkers = new Map<string, SessionWorkerRecord>();

export function storeGetSessionWorker(sessionId: string): SessionWorkerRecord | undefined {
  return sessionWorkers.get(sessionId);
}

export function storeUpsertSessionWorker(
  sessionId: string,
  patch: Partial<Omit<SessionWorkerRecord, "sessionId">>,
): SessionWorkerRecord {
  let record = sessionWorkers.get(sessionId);
  if (!record) {
    record = {
      sessionId,
      workerStatus: null,
      externalMetadata: null,
      requiresActionDetails: null,
      lastHeartbeatAt: null,
    };
    sessionWorkers.set(sessionId, record);
  }
  Object.assign(record, patch);
  return record;
}

// ---------- Token Store (legacy) ----------

const tokens = new Map<string, { username: string; createdAt: Date }>();

export function storeCreateToken(username: string, token: string): void {
  tokens.set(token, { username, createdAt: new Date() });
}

export function storeGetUserByToken(token: string): { username: string } | undefined {
  return tokens.get(token);
}

// ---------- Reset (for tests) ----------

export function storeReset() {
  sessions.clear();
  sessionOwners.clear();
  workItems.clear();
  sessionWorkers.clear();
  tokens.clear();
}
