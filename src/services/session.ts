import {
  storeCreateSession,
  storeGetSession,
  storeGetEnvironment,
  storeIsSessionOwner,
  storeGetSessionOwners,
  storeBindSession,
  storeUpdateSession,
  storeListSessions,
  storeListSessionsByUsername,
  storeListSessionsByEnvironment,
  storeListSessionsByOwnerUuid,
} from "../store";
import { getAllEventBuses, removeEventBus } from "../transport/event-bus";
import type { CreateSessionRequest, CreateCodeSessionRequest, SessionResponse, SessionSummaryResponse } from "../types/api";
import { v4 as uuid } from "uuid";

const CODE_SESSION_PREFIX = "cse_";
const WEB_SESSION_PREFIX = "session_";
const CLOSED_SESSION_STATUSES = new Set(["archived", "inactive"]);

async function toResponse(row: { id: string; environmentId: string | null; title: string | null; status: string; source: string; permissionMode: string | null; workerEpoch: number; username: string | null; createdAt: Date; updatedAt: Date }): Promise<SessionResponse> {
  const env = row.environmentId ? await storeGetEnvironment(row.environmentId) : null;
  return {
    id: row.id,
    environment_id: row.environmentId,
    agent_name: env?.agentName ?? null,
    title: row.title,
    status: row.status,
    source: row.source,
    permission_mode: row.permissionMode,
    worker_epoch: row.workerEpoch,
    username: row.username,
    created_at: row.createdAt.getTime() / 1000,
    updated_at: row.updatedAt.getTime() / 1000,
  };
}

export function toWebSessionId(sessionId: string): string {
  if (!sessionId.startsWith(CODE_SESSION_PREFIX)) return sessionId;
  return `${WEB_SESSION_PREFIX}${sessionId.slice(CODE_SESSION_PREFIX.length)}`;
}

function toCompatibleCodeSessionId(sessionId: string): string | null {
  if (!sessionId.startsWith(WEB_SESSION_PREFIX)) return null;
  return `${CODE_SESSION_PREFIX}${sessionId.slice(WEB_SESSION_PREFIX.length)}`;
}

export async function toWebSessionResponse(session: SessionResponse): Promise<SessionResponse> {
  return { ...session, id: toWebSessionId(session.id) };
}

async function toWebSessionSummaryResponse(session: SessionSummaryResponse): Promise<SessionSummaryResponse> {
  return { ...session, id: toWebSessionId(session.id) };
}

export async function createSession(req: CreateSessionRequest & { username?: string }): Promise<SessionResponse> {
  const record = await storeCreateSession({
    environmentId: req.environment_id,
    title: req.title,
    source: req.source,
    permissionMode: req.permission_mode,
    username: req.username,
    cwd: req.cwd,
  });
  return toResponse(record);
}

export async function createCodeSession(req: CreateCodeSessionRequest): Promise<SessionResponse> {
  const record = await storeCreateSession({
    idPrefix: "cse_",
    title: req.title,
    source: req.source,
    permissionMode: req.permission_mode,
    cwd: req.cwd,
  });
  return toResponse(record);
}

export async function getSession(sessionId: string): Promise<SessionResponse | null> {
  const record = storeGetSession(sessionId);
  return record ? toResponse(record) : null;
}

export function isSessionClosedStatus(status: string | null | undefined): boolean {
  return !!status && CLOSED_SESSION_STATUSES.has(status);
}

export function resolveExistingSessionId(sessionId: string): string | null {
  if (storeGetSession(sessionId)) {
    return sessionId;
  }

  const compatibleCodeSessionId = toCompatibleCodeSessionId(sessionId);
  if (compatibleCodeSessionId && storeGetSession(compatibleCodeSessionId)) {
    return compatibleCodeSessionId;
  }

  return null;
}

export function resolveExistingWebSessionId(sessionId: string): string | null {
  return resolveExistingSessionId(sessionId);
}

export function resolveOwnedWebSessionId(sessionId: string, uuid: string): string | null {
  if (storeIsSessionOwner(sessionId, uuid)) {
    return sessionId;
  }

  const compatibleCodeSessionId = toCompatibleCodeSessionId(sessionId);
  if (compatibleCodeSessionId && storeIsSessionOwner(compatibleCodeSessionId, uuid)) {
    return compatibleCodeSessionId;
  }

  // Auto-bind: if the session exists but has no owner, claim it for the requesting user
  const existingId = resolveExistingSessionId(sessionId);
  if (existingId) {
    const owners = storeGetSessionOwners(existingId);
    if (!owners || owners.size === 0) {
      storeBindSession(existingId, uuid);
      return existingId;
    }
  }

  return null;
}

export async function listWebSessionsByOwnerUuid(uuid: string): Promise<SessionResponse[]> {
  const sessions = storeListSessionsByOwnerUuid(uuid)
    .filter((session) => !isSessionClosedStatus(session.status));
  const results: SessionResponse[] = [];
  for (const s of sessions) {
    results.push(await toWebSessionResponse(await toResponse(s)));
  }
  return results;
}

export async function listWebSessionSummariesByOwnerUuid(uuid: string): Promise<SessionSummaryResponse[]> {
  return storeListSessionsByOwnerUuid(uuid)
    .filter((session) => !isSessionClosedStatus(session.status))
    .map(toSummaryResponse)
    .map(toWebSessionSummaryResponse) as unknown as SessionSummaryResponse[];
}

export async function updateSessionTitle(sessionId: string, title: string) {
  await storeUpdateSession(sessionId, { title });
}

export async function updateSessionStatus(sessionId: string, status: string) {
  await storeUpdateSession(sessionId, { status });
  const bus = getAllEventBuses().get(sessionId);
  if (!bus) return;

  bus.publish({
    id: uuid(),
    sessionId,
    type: "session_status",
    payload: { status },
    direction: "inbound",
  });
}

export async function touchSession(sessionId: string) {
  await storeUpdateSession(sessionId, {});
}

export async function archiveSession(sessionId: string) {
  await updateSessionStatus(sessionId, "archived");
  removeEventBus(sessionId);
}

export async function incrementEpoch(sessionId: string): Promise<number> {
  const record = storeGetSession(sessionId);
  if (!record) throw new Error("Session not found");
  const newEpoch = record.workerEpoch + 1;
  await storeUpdateSession(sessionId, { workerEpoch: newEpoch });
  return newEpoch;
}

export async function listSessions() {
  const results: SessionResponse[] = [];
  for (const s of storeListSessions()) {
    results.push(await toResponse(s));
  }
  return results;
}

function toSummaryResponse(row: { id: string; title: string | null; status: string; username: string | null; updatedAt: Date }): SessionSummaryResponse {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    username: row.username,
    updated_at: row.updatedAt.getTime() / 1000,
  };
}

export function listSessionSummaries(): SessionSummaryResponse[] {
  return storeListSessions().map(toSummaryResponse);
}

export function listSessionSummariesByOwnerUuid(uuid: string): SessionSummaryResponse[] {
  return storeListSessionsByOwnerUuid(uuid).map(toSummaryResponse);
}

export function listSessionSummariesByUsername(username: string): SessionSummaryResponse[] {
  return storeListSessionsByUsername(username).map(toSummaryResponse);
}

export async function listSessionsByEnvironment(envId: string) {
  const results: SessionResponse[] = [];
  for (const s of storeListSessionsByEnvironment(envId)) {
    results.push(await toResponse(s));
  }
  return results;
}
