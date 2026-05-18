import Elysia from "elysia";
import { pollWork, ackWork, stopWork, heartbeatWork } from "../../services/work-dispatch";
import { authGuardPlugin } from "../../plugins/auth";
import { updatePollTime } from "../../services/environment";

const app = new Elysia({ name: "v1-environments-work", prefix: "/v1/environments" }).use(authGuardPlugin);

/** GET /v1/environments/:id/work/poll — Long-poll for work */
app.get(
  "/:id/work/poll",
  async ({ params, set }) => {
    const envId = params.id;
    await updatePollTime(envId);
    const result = await pollWork(envId);
    if (!result) {
      // Return 204 No Content so the client's axios parses it as null
      set.status = 204;
      return null;
    }
    return result;
  },
  { apiKeyAuth: true },
);

/** POST /v1/environments/:id/work/:workId/ack — Acknowledge work */
app.post(
  "/:id/work/:workId/ack",
  async ({ params }) => {
    const workId = params.workId;
    ackWork(workId);
    return { status: "ok" };
  },
  { apiKeyAuth: true },
);

/** POST /v1/environments/:id/work/:workId/stop — Stop work */
app.post(
  "/:id/work/:workId/stop",
  async ({ params }) => {
    const workId = params.workId;
    stopWork(workId);
    return { status: "ok" };
  },
  { apiKeyAuth: true },
);

/** POST /v1/environments/:id/work/:workId/heartbeat — Heartbeat */
app.post(
  "/:id/work/:workId/heartbeat",
  async ({ params }) => {
    const workId = params.workId;
    const result = heartbeatWork(workId);
    return result;
  },
  { apiKeyAuth: true },
);

export default app;
