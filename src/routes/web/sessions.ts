import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import {
  storeGetSession,
  storeGetEnvironment,
  storeListSessionsByUserId,
} from "../../store";
import { getEventBus } from "../../transport/event-bus";
import { resolveExistingWebSessionId, resolveOwnedWebSessionId } from "../../services/session";

const app = new Elysia({ name: "web-sessions", prefix: "/web" })
  .use(authGuardPlugin);

async function toSessionResponse(row: { id: string; environmentId: string | null; title: string | null; status: string; source: string; permissionMode: string | null; workerEpoch: number; username: string | null; createdAt: Date; updatedAt: Date }) {
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

function toSessionSummary(row: { id: string; title: string | null; status: string; username: string | null; updatedAt: Date }) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    username: row.username,
    updated_at: row.updatedAt.getTime() / 1000,
  };
}

/** GET /web/sessions — List sessions owned by the current user */
app.get("/sessions", async ({ store }) => {
  const user = store.user!;
  const results = [];
  for (const s of storeListSessionsByUserId(user.id)) {
    results.push(await toSessionResponse(s));
  }
  return results;
}, { sessionAuth: true });

/** GET /web/sessions/all — List session summaries owned by the current user */
app.get("/sessions/all", ({ store }) => {
  const user = store.user!;
  const sessions = storeListSessionsByUserId(user.id).map(toSessionSummary);
  return sessions;
}, { sessionAuth: true });

/** GET /web/sessions/:id — Session detail */
app.get("/sessions/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const sessionId = params.id;
  const session = storeGetSession(sessionId);
  if (!session) {
    return error(404, { error: { type: "not_found", message: "Session not found" } });
  }
  if (session.userId && session.userId !== user.id) {
    return error(403, { error: { type: "forbidden", message: "Not your session" } });
  }
  return await toSessionResponse(session);
}, { sessionAuth: true });

/** GET /web/sessions/:id/history — Session event history
 *  Supports both sessionAuth (cookie) and uuidAuth (?uuid=) */
app.get("/sessions/:id/history", async ({ store, params, request, error }) => {
  const sessionId = params.id;
  const url = new URL(request.url);
  const uuid = url.searchParams.get("uuid");

  let resolvedId: string | null = null;
  const user = store.user;

  if (uuid) {
    resolvedId = resolveOwnedWebSessionId(sessionId, uuid);
  } else if (user && user.id) {
    const session = storeGetSession(sessionId);
    if (session && (!session.userId || session.userId === user.id)) {
      resolvedId = sessionId;
    }
  }

  if (!resolvedId) {
    resolvedId = resolveExistingWebSessionId(sessionId);
  }

  if (!resolvedId) {
    return error(404, { error: { type: "not_found", message: "Session not found" } });
  }

  const bus = getEventBus(resolvedId);
  const events = bus.getEventsSince(0);
  return { events };
}, { sessionAuth: true });

export default app;
