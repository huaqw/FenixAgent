import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── setSkill partial write 回滚 ──

const mockWriteSkillMd = mock(async () => "/tmp/skills/test-skill/SKILL.md");
const mockDeleteSkillDir = mock(async (_dir: string) => {});
const mockUpsertSkill = mock(async () => "skill_1");
const mockDeleteSkill = mock(async () => true);

mock.module("../services/config-pg", () => ({
  upsertSkill: mockUpsertSkill,
  deleteSkill: mockDeleteSkill,
  listSkills: mock(async () => []),
  getSkill: mock(async () => null),
  enableSkill: mock(async () => true),
  disableSkill: mock(async () => true),
}));

mock.module("../services/skill-fs", () => ({
  writeSkillMd: mockWriteSkillMd,
  deleteSkillDir: mockDeleteSkillDir,
  createSkillValidationError: (msg: string) => new Error(msg),
  groupUploadFiles: () => new Map(),
  listSkillsFromDir: async () => [],
  readSkillDetailFromMd: async () => null,
  resolveImportPlan: () => ({ pendingEntries: [], skipped: [] }),
  writeImportFiles: async () => [],
  buildImportedSkillInfos: async () => [],
  backupSkillDirs: async () => new Map(),
  cleanupWrittenSkills: async () => {},
  restoreFromBackup: async () => {},
  createBackupDir: async () => "/tmp/backup",
  cleanupBackupDir: async () => {},
}));

mock.module("../logger", () => ({
  log: mock(() => {}),
  error: mock(() => {}),
}));

const { setSkill } = await import("../services/skill");

describe("setSkill partial write rollback", () => {
  beforeEach(() => {
    mockWriteSkillMd.mockClear();
    mockDeleteSkillDir.mockClear();
    mockUpsertSkill.mockClear();
  });

  // PG upsert 成功时正常返回
  test("returns SkillInfo when PG upsert succeeds", async () => {
    const result = await setSkill({ teamId: "test-team", userId: "user_1", role: "owner" }, "my-skill", {
      description: "desc",
      content: "content",
    });
    expect(result.name).toBe("my-skill");
    expect(result.enabled).toBe(true);
    expect(mockDeleteSkillDir).not.toHaveBeenCalled();
  });

  // PG upsert 失败时回滚文件
  test("cleans up skill directory when PG upsert fails", async () => {
    mockUpsertSkill.mockRejectedValueOnce(new Error("PG connection lost"));

    try {
      await setSkill({ teamId: "test-team", userId: "user_1", role: "owner" }, "broken-skill", {
        description: "desc",
        content: "content",
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("PG connection lost");
      // 文件应被清理
      expect(mockDeleteSkillDir).toHaveBeenCalledTimes(1);
      expect(mockDeleteSkillDir.mock.calls[0][0]).toContain("broken-skill");
    }
  });

  // 文件清理也失败时不掩盖原始错误
  test("does not mask original error when file cleanup also fails", async () => {
    mockUpsertSkill.mockRejectedValueOnce(new Error("PG down"));
    mockDeleteSkillDir.mockRejectedValueOnce(new Error("Permission denied"));

    try {
      await setSkill({ teamId: "test-team", userId: "user_1", role: "owner" }, "doom-skill", {
        description: "desc",
        content: "content",
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      // 原始错误（PG down）应被抛出
      expect((err as Error).message).toBe("PG down");
    }
  });
});
