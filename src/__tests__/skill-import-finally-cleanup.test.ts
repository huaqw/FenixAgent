import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { _deps, _resetDeps, importSkillDirectories, importWorkspaceSkillDirectories } from "../services/skill";

const mockCleanupBackupDir = mock(() => Promise.resolve());
const mockWriteImportFiles = mock((_dir: string, _entries: unknown[]) => Promise.resolve(["test-skill"]));
const mockBuildImportedSkillInfos = mock((_dir: string, _names: string[]) =>
  Promise.resolve([{ name: "test-skill", description: "test", path: "/tmp/skill/SKILL.md" }]),
);
const mockBackupSkillDirs = mock(() => Promise.resolve(new Map()));
const mockCleanupWrittenSkills = mock(() => Promise.resolve());
const mockRestoreFromBackup = mock(() => Promise.resolve());
const mockCreateBackupDir = mock(() => Promise.resolve("/tmp/backup-xxx"));

beforeEach(() => {
  _deps.configPg = {
    getSkill: mock(async () => null),
    upsertSkill: mock(async () => "skill-id"),
    deleteSkill: mock(async () => true),
    listSkills: mock(async () => []),
    enableSkill: mock(async () => true),
    disableSkill: mock(async () => true),
  } as any;
  _deps.skillFs = {
    createSkillValidationError: (msg: string) => new Error(msg),
    groupUploadFiles: () =>
      new Map([["test-skill", [{ relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }]]]),
    listSkillsFromDir: mock(async () => []),
    readSkillDetailFromMd: mock(async () => null),
    writeSkillMd: mock(async () => "/tmp/skill/SKILL.md"),
    deleteSkillDir: mock(async () => {}),
    resolveImportPlan: mock(() => ({
      pendingEntries: [
        [
          "test-skill",
          [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }],
        ],
      ],
      skipped: [],
    })),
    writeImportFiles: mockWriteImportFiles,
    buildImportedSkillInfos: mockBuildImportedSkillInfos,
    backupSkillDirs: mockBackupSkillDirs,
    cleanupWrittenSkills: mockCleanupWrittenSkills,
    restoreFromBackup: mockRestoreFromBackup,
    createBackupDir: mockCreateBackupDir,
    cleanupBackupDir: mockCleanupBackupDir,
  };
});

afterEach(() => {
  _resetDeps();
});

describe("skill import finally block error handling", () => {
  it("全局 import：cleanupBackupDir 失败不掩盖原始成功结果", async () => {
    mockCleanupBackupDir.mockImplementationOnce(() => {
      throw new Error("backup cleanup failed");
    });

    const files = [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }];
    const result = await importSkillDirectories(
      { teamId: "test-team", userId: "user-1", role: "owner" },
      files,
      "overwrite",
    );

    expect(result.imported).toBeDefined();
    expect(result.imported.length).toBeGreaterThan(0);
  });

  it("全局 import：业务逻辑失败 + cleanupBackupDir 失败不掩盖原始错误", async () => {
    mockWriteImportFiles.mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    mockCleanupBackupDir.mockImplementationOnce(() => {
      throw new Error("cleanup failed");
    });

    const files = [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }];
    try {
      await importSkillDirectories({ teamId: "test-team", userId: "user-1", role: "owner" }, files, "overwrite");
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as Error).message).toBe("disk full");
    }
  });

  it("workspace import：cleanupBackupDir 失败不掩盖原始成功结果", async () => {
    mockCleanupBackupDir.mockImplementationOnce(() => {
      throw new Error("backup cleanup failed");
    });

    const files = [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }];
    const result = await importWorkspaceSkillDirectories("/workspace", files, "overwrite");

    expect(result.imported).toBeDefined();
    expect(result.imported.length).toBeGreaterThan(0);
  });

  it("workspace import：业务逻辑失败 + cleanupBackupDir 失败不掩盖原始错误", async () => {
    mockWriteImportFiles.mockImplementationOnce(() => {
      throw new Error("disk full ws");
    });
    mockCleanupBackupDir.mockImplementationOnce(() => {
      throw new Error("cleanup failed ws");
    });

    const files = [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }];
    try {
      await importWorkspaceSkillDirectories("/workspace", files, "overwrite");
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect((err as Error).message).toBe("disk full ws");
    }
  });
});
