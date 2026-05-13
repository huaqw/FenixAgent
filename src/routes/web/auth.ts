import Elysia from "elysia";
import { errorResponse } from "../../plugins/auth";
import { storeBindSession } from "../../store";
import { resolveExistingWebSessionId, toWebSessionId } from "../../services/session";

const app = new Elysia({ name: "web-auth", prefix: "/web" })
  .decorate({ error: errorResponse });

/** POST /web/bind — Bind a session to a UUID (no-login auth) */
app.post("/bind", async ({ body, query, error }) => {
  const b = (body as any) ?? {};
  const sessionId = b.sessionId;
  const uuid = (query as any)?.uuid || b.uuid;

  if (!sessionId || !uuid) {
    return error(400, { error: "sessionId and uuid are required" });
  }

  const resolvedSessionId = resolveExistingWebSessionId(sessionId);
  if (!resolvedSessionId) {
    return error(404, { error: "Session not found" });
  }

  storeBindSession(resolvedSessionId, uuid);
  return { ok: true, sessionId: toWebSessionId(resolvedSessionId) };
});

export default app;
