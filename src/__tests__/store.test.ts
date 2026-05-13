import { describe, test, expect, beforeEach } from "bun:test";
import {
  storeReset,
  storeCreateEnvironment,
  storeGetEnvironment,
  storeGetEnvironmentBySecret,
  storeUpdateEnvironment,
  storeListActiveEnvironments,
  storeListEnvironmentsByUserId,
  storeCreateSession,
  storeGetSession,
  storeUpdateSession,
  storeListSessions,
  storeListSessionsByEnvironment,
  storeListSessionsByUserId,
  storeDeleteSession,
  storeDeleteEnvironment,
  storeListAcpAgents,
  storeListAcpAgentsByUserId,
  storeListOnlineAcpAgents,
  storeListSessionsForAgentByCwd,
  storeLoadSessionsFromDB,
  storeCreateShareLink,
  storeRefreshSessionShareMode,
} from "../store";
import { db } from "../db";
import { user, agentSession } from "../db/schema";
import { eq } from "drizzle-orm";

async function ensureUser(userId: string) {
  const existing = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (existing.length === 0) {
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: userId,
      email: `${userId}@test.com`,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  }
}

describe("store", () => {
  beforeEach(async () => {
    storeReset();
    await ensureUser("user1");
    await ensureUser("user-a");
    await ensureUser("user-b");
    await ensureUser("u1");
  });

  // ---------- Environment ----------

  describe("storeCreateEnvironment", () => {
    test("creates environment with required fields", async () => {
      const env = await storeCreateEnvironment({ userId: "user1" });
      expect(env.id).toMatch(/^env_/);
      expect(env.secret).toBeTruthy();
      expect(env.status).toBe("active");
      expect(env.userId).toBe("user1");
      expect(env.maxSessions).toBe(1);
      expect(env.workerType).toBe("acp");
      expect(env.lastPollAt).toBeInstanceOf(Date);
      expect(env.createdAt).toBeInstanceOf(Date);
      expect(env.updatedAt).toBeInstanceOf(Date);
    });

    test("auto-generates name when not provided", async () => {
      const env = await storeCreateEnvironment({ userId: "user1" });
      expect(env.name).toMatch(/^env-/);
    });

    test("uses provided name", async () => {
      const env = await storeCreateEnvironment({ userId: "user1", name: `my-env-${Date.now()}` });
      expect(env.name).toMatch(/^my-env-/);
    });

    test("defaults workspacePath to /tmp when not provided", async () => {
      const env = await storeCreateEnvironment({ userId: "user1" });
      expect(env.workspacePath).toBe("/tmp");
    });

    test("creates environment with all optional fields", async () => {
      const env = await storeCreateEnvironment({
        userId: "user1",
        name: `test-env-${Date.now()}`,
        description: "A test environment",
        workspacePath: "/home/user/project",
        agentName: "build",
        machineName: "my-agent",
        workerType: "acp",
        capabilities: { foo: true },
      });
      expect(env.name).toMatch(/^test-env-/);
      expect(env.description).toBe("A test environment");
      expect(env.workspacePath).toBe("/home/user/project");
      expect(env.agentName).toBe("build");
      expect(env.machineName).toBe("my-agent");
      expect(env.capabilities).toEqual({ foo: true });
    });

    test("creates with custom status", async () => {
      const env = await storeCreateEnvironment({ userId: "user1", status: "idle" });
      expect(env.status).toBe("idle");
    });

    test("uses provided secret when given", async () => {
      const secret = `custom-secret-${Date.now()}`;
      const env = await storeCreateEnvironment({ secret, userId: "user1" });
      expect(env.secret).toBe(secret);
    });

    test("auto-generates secret when not provided", async () => {
      const env = await storeCreateEnvironment({ userId: "user1" });
      expect(env.secret).toMatch(/^sec_/);
    });
  });

  describe("storeGetEnvironment", () => {
    test("returns undefined for non-existent env", async () => {
      expect(await storeGetEnvironment("env_no")).toBeUndefined();
    });

    test("returns created environment by id", async () => {
      const env = await storeCreateEnvironment({ userId: "u1" });
      const fetched = await storeGetEnvironment(env.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(env.id);
      expect(fetched!.secret).toBe(env.secret);
      expect(fetched!.userId).toBe("u1");
    });
  });

  describe("storeGetEnvironmentBySecret", () => {
    test("returns environment matching secret", async () => {
      const env = await storeCreateEnvironment({ userId: "u1" });
      const fetched = await storeGetEnvironmentBySecret(env.secret);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(env.id);
    });

    test("returns undefined for non-existent secret", async () => {
      expect(await storeGetEnvironmentBySecret("no_such_secret")).toBeUndefined();
    });
  });

  describe("storeUpdateEnvironment", () => {
    test("updates existing environment fields", async () => {
      const env = await storeCreateEnvironment({ userId: "u1" });
      const result = await storeUpdateEnvironment(env.id, { status: "offline", machineName: "host1", capabilities: { bar: 1 } });
      expect(result).toBe(true);
      const updated = await storeGetEnvironment(env.id);
      expect(updated?.status).toBe("offline");
      expect(updated?.machineName).toBe("host1");
      expect(updated?.capabilities).toEqual({ bar: 1 });
    });

    test("returns false for non-existent environment", async () => {
      expect(await storeUpdateEnvironment("env_no", { status: "active" })).toBe(false);
    });
  });

  describe("storeListActiveEnvironments", () => {
    test("returns only active environments", async () => {
      const before = (await storeListActiveEnvironments()).length;
      const env1 = await storeCreateEnvironment({ userId: "u1" });
      await storeCreateEnvironment({ userId: "u1" });
      await storeUpdateEnvironment(env1.id, { status: "offline" });
      const active = await storeListActiveEnvironments();
      expect(active.length - before).toBe(1);
    });
  });

  describe("storeListEnvironmentsByUserId", () => {
    test("filters by userId", async () => {
      const beforeA = (await storeListEnvironmentsByUserId("user-a")).length;
      const beforeB = (await storeListEnvironmentsByUserId("user-b")).length;
      await storeCreateEnvironment({ userId: "user-a" });
      await storeCreateEnvironment({ userId: "user-b" });
      await storeCreateEnvironment({ userId: "user-a" });
      expect((await storeListEnvironmentsByUserId("user-a")).length - beforeA).toBe(2);
      expect((await storeListEnvironmentsByUserId("user-b")).length - beforeB).toBe(1);
      expect(await storeListEnvironmentsByUserId("user-c")).toHaveLength(0);
    });
  });

  // ---------- Session ----------

  describe("storeCreateSession", () => {
    test("creates session with defaults", async () => {
      const session = await storeCreateSession({});
      expect(session.id).toMatch(/^session_/);
      expect(session.status).toBe("idle");
      expect(session.source).toBe("acp");
      expect(session.environmentId).toBeNull();
      expect(session.userId).toBeNull();
    });

    test("creates session with options", async () => {
      const env = await storeCreateEnvironment({ userId: "u1" });
      const session = await storeCreateSession({
        environmentId: env.id,
        title: "Test Session",
        source: "web",
        userId: "u1",
      });
      expect(session.environmentId).toBe(env.id);
      expect(session.title).toBe("Test Session");
      expect(session.source).toBe("web");
      expect(session.userId).toBe("u1");
    });
  });

  describe("storeGetSession", () => {
    test("returns undefined for non-existent session", () => {
      expect(storeGetSession("nope")).toBeUndefined();
    });
  });

  describe("storeUpdateSession", () => {
    test("updates existing session", async () => {
      const session = await storeCreateSession({});
      await storeUpdateSession(session.id, { title: "Updated", status: "active" });
      const updated = storeGetSession(session.id);
      expect(updated?.title).toBe("Updated");
      expect(updated?.status).toBe("active");
    });
  });

  describe("storeListSessions", () => {
    test("returns all sessions", async () => {
      await storeCreateSession({});
      await storeCreateSession({});
      expect(storeListSessions()).toHaveLength(2);
    });
  });

  describe("storeListSessionsByEnvironment", () => {
    test("filters by environment", async () => {
      const env = await storeCreateEnvironment({ userId: "u1" });
      await storeCreateSession({ environmentId: env.id });
      await storeCreateSession({});
      expect(storeListSessionsByEnvironment(env.id)).toHaveLength(1);
    });
  });

  describe("storeListSessionsByUserId", () => {
    test("filters by userId", async () => {
      await storeCreateSession({ userId: "user-a" });
      await storeCreateSession({ userId: "user-b" });
      await storeCreateSession({ userId: "user-a" });
      expect(storeListSessionsByUserId("user-a")).toHaveLength(2);
      expect(storeListSessionsByUserId("user-b")).toHaveLength(1);
    });
  });

  describe("storeDeleteSession", () => {
    test("deletes existing session", async () => {
      const session = await storeCreateSession({});
      expect(await storeDeleteSession(session.id)).toBe(true);
      expect(storeGetSession(session.id)).toBeUndefined();
    });
  });

  // ---------- ACP Agent ----------

  describe("ACP agent lifecycle", () => {
    test("deletes agent and disassociates sessions (SET NULL)", async () => {
      const env = await storeCreateEnvironment({ userId: "u1", workerType: "acp", machineName: "agent1" });
      const session = await storeCreateSession({ environmentId: env.id, title: "test session", userId: "u1" });
      expect(await storeDeleteEnvironment(env.id)).toBe(true);
      expect(await storeGetEnvironment(env.id)).toBeUndefined();
      // Session should still exist but with null environmentId
      const updatedSession = storeGetSession(session.id);
      expect(updatedSession).toBeDefined();
      expect(updatedSession!.environmentId).toBeNull();
    });

    test("lists ACP agents", async () => {
      const before = (await storeListAcpAgents()).length;
      await storeCreateEnvironment({ userId: "u1", workerType: "acp", machineName: "a1" });
      await storeCreateEnvironment({ userId: "u1", workerType: "acp", machineName: "a2" });
      expect((await storeListAcpAgents()).length - before).toBe(2);
    });

    test("lists ACP agents by userId", async () => {
      const beforeA = (await storeListAcpAgentsByUserId("user-a")).length;
      const beforeB = (await storeListAcpAgentsByUserId("user-b")).length;
      await storeCreateEnvironment({ userId: "user-a", workerType: "acp", machineName: "a1" });
      await storeCreateEnvironment({ userId: "user-b", workerType: "acp", machineName: "a2" });
      expect((await storeListAcpAgentsByUserId("user-a")).length - beforeA).toBe(1);
      expect((await storeListAcpAgentsByUserId("user-b")).length - beforeB).toBe(1);
    });

    test("lists online ACP agents", async () => {
      const before = (await storeListOnlineAcpAgents()).length;
      await storeCreateEnvironment({ userId: "u1", workerType: "acp", machineName: "a1" });
      await storeCreateEnvironment({ userId: "u1", workerType: "acp", machineName: "a2" });
      expect((await storeListOnlineAcpAgents()).length - before).toBe(2);
    });
  });

  // ---------- storeListSessionsForAgentByCwd ----------

  describe("storeListSessionsForAgentByCwd", () => {
    test("returns sessions for agent with matching cwd (exact)", async () => {
      await ensureUser("u-cwd1");
      const env = await storeCreateEnvironment({ userId: "u-cwd1", workerType: "acp", workspacePath: "/home/user/project" });
      await storeCreateSession({ environmentId: env.id, title: "session 1", userId: "u-cwd1" });
      await storeCreateSession({ environmentId: env.id, title: "session 2", userId: "u-cwd1" });

      const result = storeListSessionsForAgentByCwd(env.id, "/home/user/project");
      expect(result).toHaveLength(2);
    });

    test("returns sessions for agent with prefix cwd match", async () => {
      await ensureUser("u-cwd2");
      const env = await storeCreateEnvironment({ userId: "u-cwd2", workerType: "acp", workspacePath: "/home/user/project/subdir" });
      await storeCreateSession({ environmentId: env.id, title: "session 1", userId: "u-cwd2" });

      const result = storeListSessionsForAgentByCwd(env.id, "/home/user/project");
      expect(result).toHaveLength(1);
    });

    test("returns empty when cwd does not match", async () => {
      await ensureUser("u-cwd3");
      const env = await storeCreateEnvironment({ userId: "u-cwd3", workerType: "acp", workspacePath: "/home/user/other-project" });
      await storeCreateSession({ environmentId: env.id, title: "session 1", userId: "u-cwd3" });

      const result = storeListSessionsForAgentByCwd(env.id, "/home/user/project");
      expect(result).toHaveLength(0);
    });

    test("returns all sessions when cwd is not specified", async () => {
      await ensureUser("u-cwd4");
      const env = await storeCreateEnvironment({ userId: "u-cwd4", workerType: "acp", workspacePath: "/home/user/project" });
      await storeCreateSession({ environmentId: env.id, title: "session 1", userId: "u-cwd4" });
      await storeCreateSession({ environmentId: env.id, title: "session 2", userId: "u-cwd4" });

      const result = storeListSessionsForAgentByCwd(env.id);
      expect(result).toHaveLength(2);
    });

    test("returns empty for non-existent agent", () => {
      const result = storeListSessionsForAgentByCwd("env_nonexistent", "/any/path");
      expect(result).toHaveLength(0);
    });
  });

  // ---------- storeReset ----------

  describe("storeReset", () => {
    test("clears in-memory data", async () => {
      await storeCreateSession({});

      storeReset();

      expect(storeListSessions()).toHaveLength(0);
    });
  });

  // ---------- Session Ownership ----------

  describe("storeBindSession / storeIsSessionOwner", () => {
    test("binds user to session and checks ownership", async () => {
      const { storeBindSession, storeIsSessionOwner } = require("../store");
      const s = await storeCreateSession({});
      storeBindSession(s.id, "uuid-1");
      expect(storeIsSessionOwner(s.id, "uuid-1")).toBe(true);
      expect(storeIsSessionOwner(s.id, "uuid-2")).toBe(false);
    });

    test("supports multiple owners", async () => {
      const { storeBindSession, storeGetSessionOwners } = require("../store");
      const s = await storeCreateSession({});
      storeBindSession(s.id, "uuid-1");
      storeBindSession(s.id, "uuid-2");
      const owners = storeGetSessionOwners(s.id);
      expect(owners).toBeDefined();
      expect(owners!.size).toBe(2);
    });
  });

  // ---------- Work Items ----------

  describe("Work Items", () => {
    test("create and get work item", async () => {
      const { storeCreateWorkItem, storeGetWorkItem } = require("../store");
      const env = await storeCreateEnvironment({ userId: "u1" });
      const session = await storeCreateSession({ environmentId: env.id });
      const item = storeCreateWorkItem({
        environmentId: env.id,
        sessionId: session.id,
        secret: "test-secret",
      });
      expect(item.id).toMatch(/^work_/);
      expect(item.state).toBe("pending");

      const fetched = storeGetWorkItem(item.id);
      expect(fetched).toBeDefined();
      expect(fetched!.environmentId).toBe(env.id);
    });

    test("get pending work item by environment", async () => {
      const { storeCreateWorkItem, storeGetPendingWorkItem } = require("../store");
      const env = await storeCreateEnvironment({ userId: "u1" });
      const session = await storeCreateSession({ environmentId: env.id });
      storeCreateWorkItem({ environmentId: env.id, sessionId: session.id, secret: "s1" });

      const pending = storeGetPendingWorkItem(env.id);
      expect(pending).toBeDefined();
      expect(pending!.state).toBe("pending");
    });

    test("update work item state", async () => {
      const { storeCreateWorkItem, storeUpdateWorkItem, storeGetWorkItem } = require("../store");
      const env = await storeCreateEnvironment({ userId: "u1" });
      const session = await storeCreateSession({ environmentId: env.id });
      const item = storeCreateWorkItem({ environmentId: env.id, sessionId: session.id, secret: "s1" });

      storeUpdateWorkItem(item.id, { state: "completed" });
      const updated = storeGetWorkItem(item.id);
      expect(updated!.state).toBe("completed");
    });
  });

  // ---------- Session Workers ----------

  describe("Session Workers", () => {
    test("upsert and get session worker", () => {
      const { storeUpsertSessionWorker, storeGetSessionWorker } = require("../store");
      const worker = storeUpsertSessionWorker("session-1", { workerStatus: "running" });
      expect(worker.sessionId).toBe("session-1");
      expect(worker.workerStatus).toBe("running");

      const fetched = storeGetSessionWorker("session-1");
      expect(fetched).toBeDefined();
      expect(fetched!.workerStatus).toBe("running");
    });

    test("upsert updates existing worker", () => {
      const { storeUpsertSessionWorker, storeGetSessionWorker } = require("../store");
      storeUpsertSessionWorker("session-1", { workerStatus: "running" });
      storeUpsertSessionWorker("session-1", { workerStatus: "idle" });
      const fetched = storeGetSessionWorker("session-1");
      expect(fetched!.workerStatus).toBe("idle");
    });
  });

  // ---------- storeListAllEnvironments ----------

  describe("storeListAllEnvironments", () => {
    test("returns all environments regardless of status", async () => {
      const { storeListAllEnvironments } = require("../store");
      const before = (await storeListAllEnvironments()).length;
      const env1 = await storeCreateEnvironment({ userId: "u1", status: "active" });
      await storeCreateEnvironment({ userId: "u1", status: "active" });
      // Deregister one
      const { storeUpdateEnvironment } = require("../store");
      await storeUpdateEnvironment(env1.id, { status: "deregistered" });
      const all = await storeListAllEnvironments();
      expect(all.length - before).toBe(2);
    });
  });

  // ---------- Session cwd field ----------

  describe("Session cwd field", () => {
    test("storeCreateSession defaults cwd to null", async () => {
      const session = await storeCreateSession({ title: "test" });
      expect(session.cwd).toBeNull();
    });

    test("storeCreateSession passes cwd through", async () => {
      const session = await storeCreateSession({ cwd: "/home/user/project" });
      expect(session.cwd).toBe("/home/user/project");
    });

    test("storeCreateSession with explicit null cwd", async () => {
      const session = await storeCreateSession({ cwd: null });
      expect(session.cwd).toBeNull();
    });
  });
});

// ---------- Write-through dual write ----------

describe("Write-through dual write", () => {
  beforeEach(() => {
    storeReset();
  });

  test("storeCreateSession writes to DB", async () => {
    const session = await storeCreateSession({ title: "db test", cwd: "/home/test" });
    const row = await db.select().from(agentSession).where(eq(agentSession.id, session.id));
    expect(row.length).toBe(1);
    expect(row[0].title).toBe("db test");
    expect(row[0].cwd).toBe("/home/test");
    expect(row[0].status).toBe("idle");
    expect(row[0].shareMode).toBe("none");
  });

  test("storeUpdateSession writes to DB", async () => {
    const session = await storeCreateSession({ title: "original" });
    await storeUpdateSession(session.id, { title: "updated", status: "running" });
    const row = await db.select().from(agentSession).where(eq(agentSession.id, session.id));
    expect(row.length).toBe(1);
    expect(row[0].title).toBe("updated");
    expect(row[0].status).toBe("running");
  });

  test("storeDeleteSession removes from DB", async () => {
    const session = await storeCreateSession({ title: "to delete" });
    await storeDeleteSession(session.id);
    const row = await db.select().from(agentSession).where(eq(agentSession.id, session.id));
    expect(row.length).toBe(0);
  });

  test("storeLoadSessionsFromDB restores sessions", async () => {
    // Clear DB agent_session table to avoid interference from other tests
    await db.delete(agentSession);
    await storeCreateSession({ title: "persist 1" });
    await storeCreateSession({ title: "persist 2" });
    // Simulate restart: clear memory, reload from DB
    storeReset();
    expect(storeListSessions().length).toBe(0);
    await storeLoadSessionsFromDB();
    expect(storeListSessions().length).toBe(2);
    const restored = storeGetSession(storeListSessions()[0].id);
    expect(restored).toBeDefined();
    expect(restored!.title).toBeDefined();
  });

  test("storeDeleteEnvironment preserves sessions with null environmentId", async () => {
    const env = await storeCreateEnvironment({ userId: "u1" });
    const session = await storeCreateSession({ environmentId: env.id, title: "env session" });
    await storeDeleteEnvironment(env.id);
    // Session should still exist in DB with null environmentId
    const row = await db.select().from(agentSession).where(eq(agentSession.id, session.id));
    expect(row.length).toBe(1);
    expect(row[0].environmentId).toBeNull();
  });

  test("storeRefreshSessionShareMode writes to DB", async () => {
    const env = await storeCreateEnvironment({ userId: "u1" });
    const session = await storeCreateSession({ environmentId: env.id });
    await storeRefreshSessionShareMode(session.id);
    const row = await db.select().from(agentSession).where(eq(agentSession.id, session.id));
    expect(row.length).toBe(1);
    expect(row[0].shareMode).toBe("none");
  });
});
