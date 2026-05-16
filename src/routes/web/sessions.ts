import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { eventService } from "../../services/event-service";
import { sessionRepo } from "../../repositories/session";
import {
  SessionHistorySchema,
} from "../../schemas/session.schema";

const app = new Elysia({ name: "web-sessions", prefix: "/web" })
  .use(authGuardPlugin)
  .model({
    "session-history": SessionHistorySchema,
  });

/** GET /web/sessions — List sessions for the current user */
app.get("/sessions", async ({ store }) => {
  const user = store.user!;
  const rows = await sessionRepo.listByUserId(user.id);
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? null,
    status: r.status,
    environment_id: r.environmentId ?? null,
    agent_name: r.username ?? null,
    source: r.source ?? null,
    created_at: Math.floor(r.createdAt.getTime() / 1000),
    updated_at: Math.floor(r.updatedAt.getTime() / 1000),
  }));
}, { sessionAuth: true });

/** GET /web/sessions/:id — Get session detail */
app.get("/sessions/:id", async ({ params, error }) => {
  const row = await sessionRepo.getById(params.id);
  if (!row) {
    return error(404, { error: { type: "not_found", message: `Session '${params.id}' not found` } });
  }
  return {
    id: row.id,
    title: row.title ?? null,
    status: row.status,
    environment_id: row.environmentId ?? null,
    agent_name: row.username ?? null,
    source: row.source ?? null,
    created_at: Math.floor(row.createdAt.getTime() / 1000),
    updated_at: Math.floor(row.updatedAt.getTime() / 1000),
  };
}, { sessionAuth: true });

/** GET /web/sessions/:id/history — Session event history (EventBus)
 *  Session 元数据已下沉到 Agent，此处仅保留事件流查询 */
app.get("/sessions/:id/history", async ({ params, error }) => {
  const sessionId = params.id;
  const bus = eventService.getBus(sessionId);
  if (!bus) {
    return error(404, { error: { type: "not_found", message: "Session event bus not found" } });
  }
  const events = bus.getEventsSince(0);
  return { events };
}, { sessionAuth: true });

export default app;
