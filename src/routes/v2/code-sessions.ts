import Elysia from "elysia";
import { createCodeSession, getSession, incrementEpoch } from "../../services/session";
import { authGuardPlugin } from "../../plugins/auth";
import { generateWorkerJwt } from "../../auth/jwt";
import { getBaseUrl, config } from "../../config";

const app = new Elysia({ name: "v1-code-sessions", prefix: "/v1/code/sessions" })
  .use(authGuardPlugin);

/** POST /v1/code/sessions — Create code session (wrapped response for TUI compat) */
app.post("/", async ({ body }) => {
  const b = (body as any) ?? {};
  const session = createCodeSession(b);
  return { session };
}, { apiKeyAuth: true });

/** POST /v1/code/sessions/:id/bridge — Get connection info + worker JWT */
app.post("/:id/bridge", async ({ params, error }) => {
  const sessionId = params.id;
  const session = getSession(sessionId);
  if (!session) {
    return error(404, { error: { type: "not_found", message: "Session not found" } });
  }

  const epoch = incrementEpoch(sessionId);
  const expiresInSeconds = config.jwtExpiresIn;
  const workerJwt = generateWorkerJwt(sessionId, expiresInSeconds);

  return {
    api_base_url: getBaseUrl(),
    worker_epoch: epoch,
    worker_jwt: workerJwt,
    expires_in: expiresInSeconds,
  };
}, { apiKeyAuth: true });

export default app;
