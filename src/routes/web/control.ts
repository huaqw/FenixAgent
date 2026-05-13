import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { log, error as logError } from "../../logger";
import { getSession, isSessionClosedStatus, resolveOwnedWebSessionId, updateSessionStatus } from "../../services/session";
import { publishSessionEvent } from "../../services/transport";
import { getEventBus } from "../../transport/event-bus";

const app = new Elysia({ name: "web-control", prefix: "/web" })
  .use(authGuardPlugin);

type OwnershipCheckResult =
  | { error: true }
  | { error: true; reason: string }
  | { error: false; session: NonNullable<ReturnType<typeof getSession>>; sessionId: string };

function checkOwnership(uuid: string | null, sessionId: string): OwnershipCheckResult {
  if (!uuid) return { error: true };
  const resolvedSessionId = resolveOwnedWebSessionId(sessionId, uuid);
  if (!resolvedSessionId) {
    return { error: true };
  }
  const session = getSession(resolvedSessionId);
  if (!session) {
    return { error: true };
  }
  if (isSessionClosedStatus(session.status)) {
    return { error: true, reason: `Session is ${session.status}` };
  }
  return { error: false, session, sessionId: resolvedSessionId };
}

function closedSessionResponse(message: string) {
  return { error: { type: "session_closed", message } };
}

/** POST /web/sessions/:id/events — Send user message to session */
app.post("/sessions/:id/events", async ({ store, params, body, error }) => {
  const requestedSessionId = params.id;
  const uuid = store.uuid;
  const ownership = checkOwnership(uuid, requestedSessionId);
  if (ownership.error) {
    const message = "reason" in ownership ? ownership.reason : "Not your session";
    const status = "reason" in ownership ? 409 : 403;
    return error(status, "reason" in ownership ? closedSessionResponse(message) : { error: { type: "forbidden", message } });
  }
  const { sessionId } = ownership;

  const b = (body as any) ?? {};
  const eventType = b.type || "user";
  log(`[RC-DEBUG] web -> server: POST /web/sessions/${sessionId}/events type=${eventType} content=${JSON.stringify(b).slice(0, 200)}`);
  const event = publishSessionEvent(sessionId, eventType, b, "outbound");
  log(`[RC-DEBUG] web -> server: published outbound event id=${event.id} type=${event.type} direction=${event.direction} subscribers=${getEventBus(sessionId).subscriberCount()}`);
  return { status: "ok", event };
}, { uuidAuth: true });

/** POST /web/sessions/:id/control — Send control request (permission approval etc) */
app.post("/sessions/:id/control", async ({ store, params, body, error }) => {
  const requestedSessionId = params.id;
  const uuid = store.uuid;
  const ownership = checkOwnership(uuid, requestedSessionId);
  if (ownership.error) {
    const message = "reason" in ownership ? ownership.reason : "Not your session";
    const status = "reason" in ownership ? 409 : 403;
    return error(status, "reason" in ownership ? closedSessionResponse(message) : { error: { type: "forbidden", message } });
  }
  const { sessionId } = ownership;

  const b = (body as any) ?? {};
  const event = publishSessionEvent(sessionId, b.type || "control_request", b, "outbound");
  return { status: "ok", event };
}, { uuidAuth: true });

/** POST /web/sessions/:id/interrupt — Interrupt session */
app.post("/sessions/:id/interrupt", async ({ store, params, error }) => {
  const requestedSessionId = params.id;
  const uuid = store.uuid;
  const ownership = checkOwnership(uuid, requestedSessionId);
  if (ownership.error) {
    const message = "reason" in ownership ? ownership.reason : "Not your session";
    const status = "reason" in ownership ? 409 : 403;
    return error(status, "reason" in ownership ? closedSessionResponse(message) : { error: { type: "forbidden", message } });
  }
  const { sessionId } = ownership;

  publishSessionEvent(sessionId, "interrupt", { action: "interrupt" }, "outbound");
  updateSessionStatus(sessionId, "idle");
  return { status: "ok" };
}, { uuidAuth: true });

export default app;
