import { afterAll, beforeEach, afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Elysia from "elysia";
import { db } from "../db";
import { user as userTable, team as teamTable, teamMember } from "../db/schema";
import { eq } from "drizzle-orm";
import { resetAllRepos, environmentRepo, sessionRepo } from "../repositories";
import { deleteEnvironment } from "../services/environment";
import { setTestAuth, resetTestAuth } from "../plugins/auth";
import { setTestTeamContext } from "../services/team-context";

const TEST_TEAM_ID = "d0000000-0000-0000-0000-000000000005";

async function ensureUser() {
  const existing = await db.select().from(userTable).where(eq(userTable.id, "test-user")).limit(1);
  if (existing.length > 0) return;
  const now = new Date();
  await db.insert(userTable).values({
    id: "test-user",
    name: "Test",
    email: "test@test.com",
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureTeam() {
  const [existing] = await db.select().from(teamTable).where(eq(teamTable.id, TEST_TEAM_ID));
  if (!existing) {
    const now = new Date();
    await db.insert(teamTable).values({
      id: TEST_TEAM_ID,
      name: "Files Route Test Team",
      slug: "files-route-test-team",
      createdBy: "test-user",
      createdAt: now,
      updatedAt: now,
    });
  }
  // 确保 teamMember 记录存在（loadTeamContext 需要查询）
  const [membership] = await db.select().from(teamMember).where(eq(teamMember.teamId, TEST_TEAM_ID)).limit(1);
  if (!membership) {
    await db.insert(teamMember).values({
      teamId: TEST_TEAM_ID,
      userId: "test-user",
      role: "owner",
    });
  }
}

await ensureUser();
await ensureTeam();

let workspaceDir = "";

function request(app: Elysia, path: string, init?: RequestInit) {
  // 注入 x-active-team-id header，确保 loadTeamContext 命中正确的团队
  const headers = new Headers(init?.headers);
  headers.set("x-active-team-id", TEST_TEAM_ID);
  return app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
}

describe("Files Route", () => {
  let app: Elysia;
  let sessionId: string;
  let envId: string;

  beforeEach(async () => {
    const authCtx = { teamId: TEST_TEAM_ID, userId: "test-user", role: "owner" as const };
    setTestAuth({
      user: { id: "test-user", email: "test@test.com", name: "Test" },
      authContext: authCtx,
    });
    setTestTeamContext(authCtx);

    workspaceDir = await mkdtemp(join(tmpdir(), "rcs-files-test-"));
    await mkdir(join(workspaceDir, "user"), { recursive: true });

    resetAllRepos();

    const env = await environmentRepo.create({
      userId: "test-user",
      teamId: TEST_TEAM_ID,
      workspacePath: workspaceDir,
      status: "active",
    });
    envId = env.id;
    const session = await sessionRepo.create({ environmentId: env.id });
    sessionId = session.id;

    const mod = await import("../routes/web/files");
    app = new Elysia();
    app.use(mod.default);
  });

  afterEach(() => {
    resetTestAuth();
    setTestTeamContext(null);
  });

  afterAll(async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  test("default empty path still resolves to user/", async () => {
    await writeFile(join(workspaceDir, "user", "hello.txt"), "Hello World");
    const res = await request(app, `/web/environments/${envId}/user`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const helloFile = body.entries.find((entry: any) => entry.name === "hello.txt");
    expect(helloFile.path).toBe("user/hello.txt");
  });

  test("GET /:sessionId/user — 404 for invalid session without environment", async () => {
    await deleteEnvironment(envId);
    resetAllRepos();
    for (const env of await environmentRepo.listByUserId("test-user")) {
      await deleteEnvironment(env.id);
    }
    const res = await request(app, `/web/environments/invalid-session/user`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(404);
  });

  test("PUT /:sessionId/user/* — writes file content", async () => {
    const res = await request(app, `/web/environments/${envId}/user/notes.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Test content" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("user/notes.txt");

    const content = await readFile(join(workspaceDir, "user", "notes.txt"), "utf-8");
    expect(content).toBe("Test content");
  });

  test("GET /:sessionId/user/* — reads written file", async () => {
    await writeFile(join(workspaceDir, "user", "readme.md"), "# Readme");
    const res = await request(app, `/web/environments/${envId}/user/readme.md`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("readme.md");
    expect(body.content).toBe("# Readme");
  });

  test("DELETE /:sessionId/user/* — deletes a file", async () => {
    await writeFile(join(workspaceDir, "user", "temp.txt"), "to delete");
    const res = await request(app, `/web/environments/${envId}/user/temp.txt`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    await expect(readFile(join(workspaceDir, "user", "temp.txt"), "utf-8")).rejects.toThrow();
  });

  test(".scheduled-runs path can be listed", async () => {
    await mkdir(join(workspaceDir, ".scheduled-runs", "task_1", "run_1"), {
      recursive: true,
    });
    await writeFile(join(workspaceDir, ".scheduled-runs", "task_1", "run_1", "report.md"), "# Report");

    const res = await request(app, `/web/environments/${envId}/user?path=.scheduled-runs/task_1/run_1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].path).toBe(".scheduled-runs/task_1/run_1/report.md");
  });

  test(".scheduled-runs file can be read", async () => {
    await mkdir(join(workspaceDir, ".scheduled-runs", "task_1", "run_1"), {
      recursive: true,
    });
    await writeFile(join(workspaceDir, ".scheduled-runs", "task_1", "run_1", "report.md"), "# Report");

    const res = await request(app, `/web/environments/${envId}/user/.scheduled-runs/task_1/run_1/report.md`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe(".scheduled-runs/task_1/run_1/report.md");
    expect(body.content).toBe("# Report");
  });

  test("path traversal is blocked for workspace root and user root", async () => {
    const listRes = await request(app, `/web/environments/${envId}/user?path=../../../etc`);
    expect(listRes.status).toBe(404);

    const putRes = await request(app, `/web/environments/${envId}/user/../../../etc/evil.txt`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hack" }),
    });
    expect(putRes.status).toBe(404);
  });

  test("workspace-root write requests are rejected", async () => {
    const putRes = await request(app, `/web/environments/${envId}/user/.scheduled-runs/task_1/run_1/report.md`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hack" }),
    });
    expect(putRes.status).toBe(400);
  });

  test("DELETE /:sessionId/user/* — 400 when trying to delete directory", async () => {
    await mkdir(join(workspaceDir, "user", "subdir"), { recursive: true });
    const res = await request(app, `/web/environments/${envId}/user/subdir`, {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
  });

  test("path traversal — DELETE with ../ returns 404", async () => {
    const res = await request(app, `/web/environments/${envId}/user/../../../etc/passwd`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  test("POST /:sessionId/user/* — uploads files", async () => {
    const formData = new FormData();
    formData.append("files", new File(["file content"], "upload.txt"));
    const res = await request(app, `/web/environments/${envId}/user/`, {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toBeDefined();
    expect(body.files.length).toBe(1);
    expect(body.files[0].name).toBe("upload.txt");
    expect(body.files[0].path).toBe("user/upload.txt");

    const content = await readFile(join(workspaceDir, "user", "upload.txt"), "utf-8");
    expect(content).toBe("file content");
  });
});
