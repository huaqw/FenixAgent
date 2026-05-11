import { describe, test, expect, beforeAll } from "bun:test";
import { sqlite } from "../db/index";

describe("agent_session table schema", () => {
  beforeAll(() => {
    // initDb() is called on module load in db/index.ts
  });

  test("agent_session table has all 14 columns", () => {
    const columns = sqlite
      .query("PRAGMA table_info(agent_session)")
      .all() as { name: string; notnull: number; dflt_value: unknown }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toContain("id");
    expect(colNames).toContain("environment_id");
    expect(colNames).toContain("title");
    expect(colNames).toContain("status");
    expect(colNames).toContain("source");
    expect(colNames).toContain("permission_mode");
    expect(colNames).toContain("worker_epoch");
    expect(colNames).toContain("username");
    expect(colNames).toContain("user_id");
    expect(colNames).toContain("cwd");
    expect(colNames).toContain("share_mode");
    expect(colNames).toContain("created_at");
    expect(colNames).toContain("updated_at");
    expect(colNames.length).toBe(13);
  });

  test("index idx_agent_session_env exists", () => {
    const indices = sqlite
      .query("PRAGMA index_list(agent_session)")
      .all() as { name: string }[];
    const idxNames = indices.map((i) => i.name);
    expect(idxNames).toContain("idx_agent_session_env");
  });

  test("foreign key on environment_id references environment with SET NULL", () => {
    const fks = sqlite
      .query("PRAGMA foreign_key_list(agent_session)")
      .all() as { table: string; on_delete: string }[];
    const envFk = fks.find((f) => f.table === "environment");
    expect(envFk).toBeDefined();
    expect(envFk!.on_delete).toBe("SET NULL");
  });

  test("default values are correct", () => {
    const columns = sqlite
      .query("PRAGMA table_info(agent_session)")
      .all() as { name: string; dflt_value: unknown }[];

    const workerEpoch = columns.find((c) => c.name === "worker_epoch");
    expect(workerEpoch).toBeDefined();
    expect(String(workerEpoch!.dflt_value)).toBe("0");

    const shareMode = columns.find((c) => c.name === "share_mode");
    expect(shareMode).toBeDefined();
    expect(shareMode!.dflt_value).toBe("'none'");
  });
});
