import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { createWorkerEventStream } from "../../transport/sse-writer";
import { getSession } from "../../services/session";

const app = new Elysia({ name: "v1-code-sessions-worker-events-stream", prefix: "/v1/code/sessions" }).use(
  authGuardPlugin,
);

/** SSE /v1/code/sessions/:id/worker/events/stream — SSE event stream */
app.get(
  "/:id/worker/events/stream",
  async ({ request, params, query, error }) => {
    const sessionId = params.id;
    const session = getSession(sessionId);
    if (!session) {
      return error(404, { error: { type: "not_found", message: "Session not found" } });
    }

    // Support Last-Event-ID / from_sequence_num for reconnection
    const lastEventId = request.headers.get("Last-Event-ID");
    const fromSeq = (query as any)?.from_sequence_num;
    const fromSeqNum = fromSeq ? parseInt(fromSeq) : lastEventId ? parseInt(lastEventId) : 0;

    return createWorkerEventStream(request, sessionId, fromSeqNum);
  },
  { sessionIngressAuth: true },
);

export default app;
