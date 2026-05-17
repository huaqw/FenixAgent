import { describe, expect, it, mock } from "bun:test";

// mock logger
const mockLogError = mock(() => {});
// mock config-pg
mock.module("../services/config-pg", () => ({
  getSkill: mock(() => Promise.resolve(null)),
  upsertSkill: mock(() => Promise.resolve("skill-id")),
  deleteSkill: mock(() => Promise.resolve(true)),
}));

// mock repositories
mock.module("../repositories", () => ({
  environmentRepo: { listByUserId: mock(() => Promise.resolve([])) },
}));

// mock skill-fs 中的关键函数
const mockCleanupBackupDir = mock(() => Promise.resolve());
mock.module("../services/skill-fs", () => ({
  createSkillValidationError: (msg: string) => new Error(msg),
  groupUploadFiles: mock(() => new Map([
    ["test-skill", [{ relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }]],
  ])),
  listSkillsFromDir: mock(() => []),
  readSkillDetailFromMd: mock(() => null),
  writeSkillMd: mock(() => "/tmp/skill/SKILL.md"),
  deleteSkillDir: mock(() => Promise.resolve()),
  resolveImportPlan: mock((_grouped: unknown, _conflicts: unknown[], _strategy: unknown) => ({
    pendingEntries: [["test-skill", [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }]]],
    skipped: [],
  })),
  writeImportFiles: mock(() => Promise.resolve(["test-skill"])),
  buildImportedSkillInfos: mock(() => Promise.resolve([{ name: "test-skill", description: "test", path: "/tmp/skill/SKILL.md" }])),
  backupSkillDirs: mock(() => Promise.resolve(new Map())),
  cleanupWrittenSkills: mock(() => Promise.resolve()),
  restoreFromBackup: mock(() => Promise.resolve()),
  createBackupDir: mock(() => Promise.resolve("/tmp/backup-xxx")),
  cleanupBackupDir: mockCleanupBackupDir,
}));

const { importSkillDirectories, importWorkspaceSkillDirectories } = await import("../services/skill");

describe("skill import finally block error handling", () => {
  it("全局 import：cleanupBackupDir 失败不掩盖原始成功结果", async () => {
    // 正常导入成功后，finally 中 cleanupBackupDir 抛出异常
    mockCleanupBackupDir.mockImplementationOnce(() => {
      throw new Error("backup cleanup failed");
    });

    const files = [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }];
    const result = await importSkillDirectories({ teamId: "test-team", userId: "user-1", role: "owner" }, files, "overwrite");

    // 导入结果应该成功返回（cleanupBackupDir 的错误被 catch 吞掉）
    expect(result.imported).toBeDefined();
    expect(result.imported.length).toBeGreaterThan(0);
  });

  it("全局 import：业务逻辑失败 + cleanupBackupDir 失败不掩盖原始错误", async () => {
    const { writeImportFiles } = await import("../services/skill-fs");
    const origWriteImportFiles = writeImportFiles;
    // writeImportFiles 抛出业务错误
    (origWriteImportFiles as ReturnType<typeof mock>).mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    // cleanupBackupDir 也抛出
    mockCleanupBackupDir.mockImplementationOnce(() => {
      throw new Error("cleanup failed");
    });

    const files = [{ skillName: "test-skill", relativePath: "SKILL.md", content: "---\nname: test\n---\ncontent" }];
    try {
      await importSkillDirectories({ teamId: "test-team", userId: "user-1", role: "owner" }, files, "overwrite");
      expect(true).toBe(false); // should not reach
    } catch (err: unknown) {
      // 原始错误应该是 "disk full"，不是 "cleanup failed"
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
    const { writeImportFiles } = await import("../services/skill-fs");
    (writeImportFiles as ReturnType<typeof mock>).mockImplementationOnce(() => {
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
