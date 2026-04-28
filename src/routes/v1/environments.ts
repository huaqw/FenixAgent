import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { apiKeyAuth } from "../../auth/middleware";
import {
  storeCreateEnvironment,
  storeCreateSession,
  storeDeleteEnvironment,
  storeGetEnvironment,
  storeUpdateEnvironment,
  storeListSessionsByEnvironment,
} from "../../store";

const app = new Hono();

function generateBridgeSecret(): string {
  return `rest_${randomBytes(24).toString("hex")}`;
}

/** POST /v1/environments/bridge — REST registration for acp-link compatibility */
app.post("/bridge", apiKeyAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    machine_name?: string;
    directory?: string;
    branch?: string;
    git_repo_url?: string;
    max_sessions?: number;
    worker_type?: string;
    bridge_id?: string;
    capabilities?: Record<string, unknown>;
    metadata?: { worker_type?: string };
  }>();

  // If authenticated via environment secret, return the existing environment
  const authEnvId = c.get("authEnvironmentId") as string | undefined;
  if (authEnvId) {
    const existing = storeGetEnvironment(authEnvId);
    if (existing) {
      storeUpdateEnvironment(authEnvId, {
        status: "active",
        lastPollAt: new Date(),
        capabilities: body.capabilities || undefined,
        maxSessions: body.max_sessions,
      });

      const sessions = storeListSessionsByEnvironment(authEnvId);
      return c.json({
        environment_id: existing.id,
        environment_secret: existing.secret,
        status: "active",
        session_id: sessions.length > 0 ? sessions[0].id : undefined,
      }, 200);
    }
  }

  const workerType = body.worker_type || body.metadata?.worker_type || "acp";

  const record = storeCreateEnvironment({
    secret: generateBridgeSecret(),
    userId: user.id,
    machineName: body.machine_name,
    directory: body.directory,
    branch: body.branch,
    gitRepoUrl: body.git_repo_url,
    maxSessions: body.max_sessions,
    workerType,
    capabilities: body.capabilities,
  });

  let sessionId: string | undefined;
  if (workerType === "acp") {
    const existing = storeListSessionsByEnvironment(record.id);
    if (existing.length > 0) {
      sessionId = existing[0].id;
    } else {
      const session = storeCreateSession({
        environmentId: record.id,
        title: body.machine_name || "ACP Agent",
        source: "acp",
        userId: user.id,
      });
      sessionId = session.id;
    }
  }

  return c.json({
    environment_id: record.id,
    environment_secret: record.secret,
    status: record.status,
    session_id: sessionId,
  }, 200);
});

/** DELETE /v1/environments/bridge/:id — Deregister */
app.delete("/bridge/:id", apiKeyAuth, async (c) => {
  const user = c.get("user")!;
  const envId = c.req.param("id")!;
  const env = storeGetEnvironment(envId);
  if (!env || env.userId !== user.id) {
    return c.json({ error: { type: "not_found", message: "Environment not found" } }, 404);
  }
  storeDeleteEnvironment(envId);
  return c.json({ status: "ok" }, 200);
});

/** POST /v1/environments/:id/bridge/reconnect — Reconnect */
app.post("/:id/bridge/reconnect", apiKeyAuth, async (c) => {
  const user = c.get("user")!;
  const envId = c.req.param("id")!;
  const env = storeGetEnvironment(envId);
  if (!env || env.userId !== user.id) {
    return c.json({ error: { type: "not_found", message: "Environment not found" } }, 404);
  }
  storeUpdateEnvironment(envId, { status: "active" });
  return c.json({ status: "ok" }, 200);
});

export default app;
