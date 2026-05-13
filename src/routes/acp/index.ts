import Elysia from "elysia";
import { validateApiKeyAndGetUser } from "../../auth/api-key-service";
import { auth } from "../../auth/better-auth";
import { config } from "../../config";
import { db } from "../../db";
import { user } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  handleAcpWsOpen,
  handleAcpWsMessage,
  handleAcpWsClose,
} from "../../transport/acp-ws-handler";
import {
  handleRelayOpen,
  handleRelayMessage,
  handleRelayClose,
} from "../../transport/acp-relay-handler";
import {
  storeListAcpAgentsByUserId,
  storeGetEnvironment,
} from "../../store";
import { log, error as logError } from "../../logger";
import { authGuardPlugin } from "../../plugins/auth";
import type { WsConnection } from "../../transport/ws-types";
import { v4 as uuid } from "uuid";

/** Maximum WebSocket message size: 10 MB */
const MAX_WS_MESSAGE_SIZE = 10 * 1024 * 1024;

/** Adapt Elysia WS to WsConnection interface */
function adaptWs(ws: any): WsConnection {
  return {
    send: (data: string) => ws.send(data),
    close: (code?: number, reason?: string) => ws.close(code, reason),
    get readyState() { return ws.readyState; },
  };
}

/** Response shape for an ACP agent */
function toAcpAgentResponse(env: NonNullable<Awaited<ReturnType<typeof storeGetEnvironment>>>) {
  return {
    id: env.id,
    agent_name: env.machineName,
    status: env.status === "active" ? "online" : "offline",
    max_sessions: env.maxSessions,
    last_seen_at: env.lastPollAt ? env.lastPollAt.getTime() / 1000 : null,
    created_at: env.createdAt.getTime() / 1000,
  };
}

/**
 * Find or create the system user for legacy global API key fallback.
 * Mirrors the logic in plugins/auth.ts ensureSystemUser.
 */
async function ensureSystemUser(): Promise<{ id: string; email: string; name: string } | null> {
  const rows = await db.select().from(user).where(eq(user.email, "system@rcs.local")).limit(1);
  if (rows.length > 0) {
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name };
  }

  const anyUser = await db.select().from(user).limit(1);
  if (anyUser.length > 0) {
    return { id: anyUser[0].id, email: anyUser[0].email, name: anyUser[0].name };
  }

  try {
    const result = await (auth.api.signUpEmail as any)({
      email: "system@rcs.local",
      password: "system",
      name: "System",
    });
    if (result.user) {
      const { createApiKey } = await import("../../auth/api-key-service");
      await createApiKey(result.user.id, "legacy-auto");
      return { id: result.user.id, email: result.user.email, name: result.user.name };
    }
  } catch {
    // signUpEmail may fail if user was created concurrently
  }

  return null;
}

/** Resolve userId from token (three-level auth) */
async function resolveTokenAuth(token: string | undefined): Promise<{ userId: string; envId?: string } | null> {
  if (!token) return null;

  // 0. Environment secret match
  const { storeGetEnvironmentBySecret } = await import("../../store");
  const envRecord = await storeGetEnvironmentBySecret(token);
  if (envRecord) {
    if (envRecord.userId) {
      return { userId: envRecord.userId, envId: envRecord.id };
    }
  }

  // 1. Per-user API Key
  const keyInfo = await validateApiKeyAndGetUser(token);
  if (keyInfo) {
    const [userRow] = await db.select().from(user).where(eq(user.id, keyInfo.userId)).limit(1);
    if (userRow) {
      return { userId: userRow.id };
    }
  }

  // 2. Legacy global API Key
  if (config.apiKeys.length > 0 && config.apiKeys.includes(token)) {
    const systemUser = await ensureSystemUser();
    if (systemUser) {
      return { userId: systemUser.id };
    }
  }

  return null;
}

const app = new Elysia({ name: "acp", prefix: "/acp" })
  .use(authGuardPlugin)

  /** GET /acp/agents — List current user's ACP agents */
  .get("/agents", async ({ store }) => {
    const currentUser = store.user!;
    const agents = await storeListAcpAgentsByUserId(currentUser.id);
    return agents.map((a) => toAcpAgentResponse(a));
  }, { sessionAuth: true })

  /** WS /acp/ws — WebSocket endpoint for acp-link connections */
  .ws("/ws", {
    async open(ws) {
      // Authenticate via API key
      const url = new URL(ws.data.request.url);
      const authHeader = ws.data.request.headers.get("Authorization");
      const queryToken = url.searchParams.get("token");
      const token = authHeader?.replace("Bearer ", "") || queryToken || undefined;

      const conn = adaptWs(ws);

      if (!token) {
        log("[ACP-WS] Upgrade rejected: missing token");
        conn.close(4003, "unauthorized");
        return;
      }

      const authResult = await resolveTokenAuth(token);
      if (!authResult) {
        log("[ACP-WS] Upgrade rejected: invalid API key");
        conn.close(4003, "unauthorized");
        return;
      }

      const wsId = `acp_ws_${uuid().replace(/-/g, "")}`;
      (ws as any).__acpWsId = wsId;
      log(`[ACP-WS] Upgrade accepted: wsId=${wsId} userId=${authResult.userId}`);
      handleAcpWsOpen(conn, wsId, authResult.userId, authResult.envId);
    },
    message(ws, data) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
      if (text.length > MAX_WS_MESSAGE_SIZE) {
        logError(`[ACP-WS] Message too large: ${text.length} bytes`);
        adaptWs(ws).close(1009, "message too large");
        return;
      }
      // Use ws.data for wsId — we need to track it. For now, pass the raw ws.
      // The handler tracks by wsId, but we don't have it here.
      // We need a way to pass wsId from open to message/close.
      // Store wsId in ws.data via store or metadata.
      const wsId = (ws as any).__acpWsId as string | undefined;
      if (wsId) {
        handleAcpWsMessage(adaptWs(ws), wsId, text);
      }
    },
    close(ws, code, reason) {
      const wsId = (ws as any).__acpWsId as string | undefined;
      if (wsId) {
        handleAcpWsClose(adaptWs(ws), wsId, code, reason);
      }
    },
  })

  /** WS /acp/relay/:agentId — WebSocket relay for frontend to interact with an agent */
  .ws("/relay/:agentId", {
    async open(ws) {
      // Authenticate via better-auth session
      const session = await auth.api.getSession({ headers: ws.data.request.headers });
      if (!session?.user) {
        log("[ACP-Relay] Upgrade rejected: not authenticated");
        adaptWs(ws).close(4003, "unauthorized");
        return;
      }

      const userId = session.user.id;
      const agentId = ws.data.params.agentId;
      const sessionId = ws.data.query?.sessionId as string | undefined;

      // Verify agent belongs to this user
      const env = await storeGetEnvironment(agentId);
      if (!env || env.userId !== userId) {
        log(`[ACP-Relay] Upgrade rejected: agent ${agentId} not found or not owned by user ${userId}`);
        adaptWs(ws).close(4003, "unauthorized");
        return;
      }

      const relayWsId = `relay_${uuid().replace(/-/g, "")}`;
      (ws as any).__relayWsId = relayWsId;

      log(`[ACP-Relay] Upgrade accepted: relayWsId=${relayWsId} agentId=${agentId}`);
      handleRelayOpen(adaptWs(ws), relayWsId, agentId, userId, sessionId);
    },
    message(ws, data) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
      if (text.length > MAX_WS_MESSAGE_SIZE) {
        logError(`[ACP-Relay] Message too large: ${text.length} bytes`);
        adaptWs(ws).close(1009, "message too large");
        return;
      }
      const relayWsId = (ws as any).__relayWsId as string | undefined;
      if (relayWsId) {
        handleRelayMessage(adaptWs(ws), relayWsId, text);
      }
    },
    close(ws, code, reason) {
      const relayWsId = (ws as any).__relayWsId as string | undefined;
      if (relayWsId) {
        handleRelayClose(adaptWs(ws), relayWsId, code, reason);
      }
    },
  });

export default app;
