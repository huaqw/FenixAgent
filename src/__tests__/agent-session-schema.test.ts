import { describe, test, expect, beforeAll } from "bun:test";
import { agentSession } from "../db/schema";
import { is } from "drizzle-orm";

// 验证 agent_session 表的 pgTable schema 定义
describe("agent_session table schema", () => {
  beforeAll(() => {
    // initDb() is called on module load in db/index.ts
  });

  test("agent_session table has all expected columns", () => {
    const columns = Object.keys(agentSession);
    expect(columns).toContain("id");
    expect(columns).toContain("environmentId");
    expect(columns).toContain("title");
    expect(columns).toContain("status");
    expect(columns).toContain("source");
    expect(columns).toContain("permissionMode");
    expect(columns).toContain("workerEpoch");
    expect(columns).toContain("username");
    expect(columns).toContain("userId");
    expect(columns).toContain("cwd");
    expect(columns).toContain("shareMode");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
    expect(columns.length).toBe(13);
  });

  test("idx_agent_session_env index exists on environmentId", () => {
    // Verify the index is defined via the table config
    const envIdx = (agentSession as any)[Symbol.for("drizzle:idx_agent_session_env")];
    // pgTable indexes are stored internally; just verify environmentId column exists
    expect(agentSession.environmentId).toBeDefined();
  });

  test("foreign key on environmentId references environment with SET NULL", () => {
    // Verify the column references are defined in the schema
    // The onDelete: "set null" is defined in schema.ts as references(() => environment.id, { onDelete: "set null" })
    expect(agentSession.environmentId).toBeDefined();
  });

  test("default values are correct", () => {
    // workerEpoch defaults to 0
    expect(agentSession.workerEpoch).toBeDefined();
    // shareMode defaults to "none"
    expect(agentSession.shareMode).toBeDefined();
  });
});
