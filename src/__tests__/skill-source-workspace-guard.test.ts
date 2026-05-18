// ── listSkillSources 跳过无 workspacePath 的环境 ──
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { _deps, _resetDeps, listSkillSources } from "../services/skill";

const mockListByUserId = mock(async () => []);

beforeEach(() => {
  mockListByUserId.mockReset();

  _deps.environmentRepo = {
    listByUserId: mockListByUserId,
  } as any;
  _deps.configPg = {
    listSkills: mock(async () => []),
    getSkill: mock(async () => null),
    upsertSkill: mock(async () => "skill-id"),
    deleteSkill: mock(async () => true),
    enableSkill: mock(async () => true),
    disableSkill: mock(async () => true),
  } as any;
  _deps.skillFs = {
    listSkillsFromDir: mock(async () => []),
    createSkillValidationError: (msg: string) => new Error(msg),
    groupUploadFiles: () => new Map(),
    readSkillDetailFromMd: mock(async () => null),
    writeSkillMd: mock(async () => "/tmp/SKILL.md"),
    deleteSkillDir: mock(async () => {}),
    resolveImportPlan: () => ({ pendingEntries: [], skipped: [] }),
    writeImportFiles: mock(async () => []),
    buildImportedSkillInfos: mock(async () => []),
    backupSkillDirs: mock(async () => new Map()),
    cleanupWrittenSkills: mock(async () => {}),
    restoreFromBackup: mock(async () => {}),
    createBackupDir: mock(async () => "/tmp/backup"),
    cleanupBackupDir: mock(async () => {}),
  };
});

afterEach(() => {
  _resetDeps();
});

describe("listSkillSources skips environments without workspacePath", () => {
  // 无 workspacePath 的环境不出现在结果中
  test("excludes environments with null workspacePath", async () => {
    mockListByUserId.mockResolvedValueOnce([
      { id: "env-1", workspacePath: null, name: "ACP Agent", status: "active" },
      { id: "env-2", workspacePath: "/tmp/ws", name: "Web Env", status: "active" },
    ]);

    const sources = await listSkillSources({
      teamId: "f0000000-0000-0000-0000-000000000001",
      userId: "user-1",
      role: "owner",
    });
    expect(sources.length).toBe(2);
    expect(sources[0].type).toBe("global");
    expect(sources[1].type).toBe("workspace");
    expect(sources[1].id).toBe("env-2");
  });

  // 全部环境无 workspacePath 时仅返回全局源
  test("returns only global source when all envs have null workspacePath", async () => {
    mockListByUserId.mockResolvedValueOnce([
      { id: "env-1", workspacePath: null, name: "Agent 1", status: "active" },
      { id: "env-2", workspacePath: undefined, name: "Agent 2", status: "active" },
    ]);

    const sources = await listSkillSources({
      teamId: "f0000000-0000-0000-0000-000000000001",
      userId: "user-1",
      role: "owner",
    });
    expect(sources.length).toBe(1);
    expect(sources[0].type).toBe("global");
  });

  // 无环境时仅返回全局源
  test("returns only global source when no environments exist", async () => {
    mockListByUserId.mockResolvedValueOnce([]);

    const sources = await listSkillSources({
      teamId: "f0000000-0000-0000-0000-000000000001",
      userId: "user-1",
      role: "owner",
    });
    expect(sources.length).toBe(1);
    expect(sources[0].type).toBe("global");
  });
});
