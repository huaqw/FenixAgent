import { describe, test, expect, beforeEach } from "bun:test";
import {
  storeReset,
  storeCreateEnvironment,
  storeCreateSession,
  storeGetSession,
  storeBindSession,
  storeGetSessionOwners,
} from "../store";
import { db } from "../db";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  toWebSessionId,
  toWebSessionResponse,
  createSession,
  createCodeSession,
  getSession,
  isSessionClosedStatus,
  resolveExistingSessionId,
  resolveOwnedWebSessionId,
  listWebSessionsByOwnerUuid,
  updateSessionTitle,
  touchSession,
  listSessions,
} from "../services/session";
import { removeEventBus, getAllEventBuses } from "../transport/event-bus";

async function ensureUser(userId: string) {
  const existing = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (existing.length === 0) {
    const now = new Date();
    try {
      await db.insert(user).values({
        id: userId,
        name: userId,
        email: `${userId}@session-svc-test.com`,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // User might already exist
    }
  }
}

describe("Session Service - Extended Tests", () => {
  beforeEach(async () => {
    await ensureUser("u1");
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
  });

  describe("toWebSessionId", () => {
    test("converts cse_ prefix to session_ prefix", () => {
      expect(toWebSessionId("cse_abc123")).toBe("session_abc123");
    });

    test("leaves session_ prefix unchanged", () => {
      expect(toWebSessionId("session_abc123")).toBe("session_abc123");
    });

    test("leaves other prefixes unchanged", () => {
      expect(toWebSessionId("other_abc123")).toBe("other_abc123");
    });
  });

  describe("toWebSessionResponse", () => {
    test("converts session id to web format", async () => {
      const s = await createSession({});
      const webResp = await toWebSessionResponse(s);
      expect(webResp.id).toBe(s.id);
    });

    test("converts code session id to web format", async () => {
      const env = await storeCreateEnvironment({ userId: "u1" });
      // Manually create a session with cse_ prefix
      const record = await storeCreateSession({
        idPrefix: "cse_",
        environmentId: env.id,
        title: "Code Session",
      });
      // Build a response-like object
      const resp = {
        id: record.id,
        environment_id: record.environmentId,
        agent_name: null,
        title: record.title,
        status: record.status,
        source: record.source,
        permission_mode: record.permissionMode,
        worker_epoch: record.workerEpoch,
        username: record.username,
        created_at: record.createdAt.getTime() / 1000,
        updated_at: record.updatedAt.getTime() / 1000,
      };
      const webResp = await toWebSessionResponse(resp);
      expect(webResp.id).toBe(`session_${record.id.slice(4)}`);
    });
  });

  describe("isSessionClosedStatus", () => {
    test("returns true for archived", () => {
      expect(isSessionClosedStatus("archived")).toBe(true);
    });

    test("returns true for inactive", () => {
      expect(isSessionClosedStatus("inactive")).toBe(true);
    });

    test("returns false for active", () => {
      expect(isSessionClosedStatus("active")).toBe(false);
    });

    test("returns false for idle", () => {
      expect(isSessionClosedStatus("idle")).toBe(false);
    });

    test("returns false for null", () => {
      expect(isSessionClosedStatus(null)).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(isSessionClosedStatus(undefined)).toBe(false);
    });
  });

  describe("resolveExistingSessionId", () => {
    test("returns id when session exists", async () => {
      const s = await createSession({});
      expect(resolveExistingSessionId(s.id)).toBe(s.id);
    });

    test("returns null when session does not exist", () => {
      expect(resolveExistingSessionId("nonexistent")).toBeNull();
    });

    test("resolves web session id to code session id", async () => {
      const record = await storeCreateSession({ idPrefix: "cse_" });
      const webId = `session_${record.id.slice(4)}`;
      expect(resolveExistingSessionId(webId)).toBe(record.id);
    });
  });

  describe("resolveOwnedWebSessionId", () => {
    test("returns session id when user is owner", async () => {
      const s = await createSession({});
      storeBindSession(s.id, "user-uuid-1");
      expect(resolveOwnedWebSessionId(s.id, "user-uuid-1")).toBe(s.id);
    });

    test("returns null when session does not exist", () => {
      expect(resolveOwnedWebSessionId("nonexistent", "user-uuid-1")).toBeNull();
    });

    test("returns null when user is not owner and session has owners", async () => {
      const s = await createSession({});
      storeBindSession(s.id, "user-uuid-1");
      expect(resolveOwnedWebSessionId(s.id, "user-uuid-2")).toBeNull();
    });

    test("auto-binds unclaimed session to requesting user", async () => {
      const s = await createSession({});
      // Session has no owners
      const owners = storeGetSessionOwners(s.id);
      expect(owners).toBeUndefined();

      const resolved = resolveOwnedWebSessionId(s.id, "user-uuid-auto");
      expect(resolved).toBe(s.id);

      // Now the session should be bound
      const ownersAfter = storeGetSessionOwners(s.id);
      expect(ownersAfter?.has("user-uuid-auto")).toBe(true);
    });
  });

  describe("listWebSessionsByOwnerUuid", () => {
    test("returns only owned and non-closed sessions in web format", async () => {
      const s1 = await createSession({ title: "Active 1" });
      const s2 = await createSession({ title: "Active 2" });
      storeBindSession(s1.id, "user-a");
      storeBindSession(s2.id, "user-a");

      const result = await listWebSessionsByOwnerUuid("user-a");
      expect(result).toHaveLength(2);
    });

    test("excludes archived sessions", async () => {
      const s1 = await createSession({});
      storeBindSession(s1.id, "user-a");
      // Archive s1
      const session = storeGetSession(s1.id);
      if (session) {
        const { storeUpdateSession } = require("../store");
        await storeUpdateSession(s1.id, { status: "archived" });
      }

      const result = await listWebSessionsByOwnerUuid("user-a");
      expect(result).toHaveLength(0);
    });
  });

  describe("updateSessionTitle", () => {
    test("updates title in store", async () => {
      const s = await createSession({ title: "Original" });
      await updateSessionTitle(s.id, "Updated Title");
      expect((await getSession(s.id))?.title).toBe("Updated Title");
    });
  });

  describe("touchSession", () => {
    test("updates updatedAt without changing other fields", async () => {
      const s = await createSession({ title: "Keep This" });
      const originalTitle = (await getSession(s.id))?.title;
      await touchSession(s.id);
      expect((await getSession(s.id))?.title).toBe(originalTitle);
    });
  });

  describe("listSessions", () => {
    test("returns all sessions including closed", async () => {
      await createSession({});
      await createSession({});
      const all = await listSessions();
      expect(all).toHaveLength(2);
    });
  });

  describe("cwd passthrough", () => {
    test("createSession passes cwd to store", async () => {
      const session = await createSession({ cwd: "/home/user/project" });
      const record = storeGetSession(session.id);
      expect(record).toBeDefined();
      expect(record!.cwd).toBe("/home/user/project");
    });

    test("createSession without cwd defaults to null", async () => {
      const session = await createSession({});
      const record = storeGetSession(session.id);
      expect(record).toBeDefined();
      expect(record!.cwd).toBeNull();
    });

    test("createCodeSession passes cwd to store", async () => {
      const session = await createCodeSession({ cwd: "/tmp/workspace" });
      const record = storeGetSession(session.id);
      expect(record).toBeDefined();
      expect(record!.cwd).toBe("/tmp/workspace");
    });
  });
});
