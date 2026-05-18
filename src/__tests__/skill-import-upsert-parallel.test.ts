// importSkillDirectories 导入成功后 upsertSkill 并行化测试
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { _deps, _resetDeps, importSkillDirectories } from "../services/skill";
import type { UploadSkillFile } from "../services/skill-fs";

const upsertSkillMock = mock(async () => "skill_1");
const getSkillMock = mock<(_ctx: any, _name: string) => Promise<unknown>>(async () => null);

beforeEach(() => {
  upsertSkillMock.mockClear();
  getSkillMock.mockClear();
  getSkillMock.mockImplementation(async () => null);

  _deps.configPg = {
    deleteSkill: mock(async () => true),
    upsertSkill: upsertSkillMock,
    getSkill: getSkillMock,
    listSkills: mock(async () => []),
    enableSkill: mock(async () => true),
    disableSkill: mock(async () => true),
  } as any;
  _deps.skillFs = {
    createSkillValidationError: (msg: string) => new Error(msg),
    groupUploadFiles: (files: { skillName: string; relativePath: string; content: string }[]) => {
      const map = new Map<string, { skillName: string; relativePath: string; content: string }[]>();
      for (const f of files) {
        const arr = map.get(f.skillName) ?? [];
        arr.push(f);
        map.set(f.skillName, arr);
      }
      return map;
    },
    listSkillsFromDir: mock(async () => []),
    readSkillDetailFromMd: mock(async () => null),
    writeSkillMd: mock(async (_dir: string, _name: string) => "/path/SKILL.md"),
    deleteSkillDir: mock(async () => {}),
    resolveImportPlan: (grouped: Map<string, unknown>) => ({
      pendingEntries: Array.from(grouped.entries()),
      skipped: [],
    }),
    writeImportFiles: mock(async (_dir: string, entries: [string, unknown][]) => entries.map(([n]) => n)),
    buildImportedSkillInfos: mock(async (_dir: string, names: string[]) =>
      names.map((n) => ({ name: n, description: `desc-${n}`, path: `/path/${n}/SKILL.md` })),
    ),
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

function makeFile(skillName: string): UploadSkillFile {
  return { skillName, relativePath: "SKILL.md", content: `---\nname: ${skillName}\n---\nContent` };
}

describe("importSkillDirectories upsertSkill 并行化", () => {
  test("多个 skill 导入时 upsertSkill 应被并行调用（非 for 循环顺序）", async () => {
    await importSkillDirectories({ teamId: "test-team", userId: "user_1", role: "owner" }, [
      makeFile("a"),
      makeFile("b"),
      makeFile("c"),
    ]);

    expect(upsertSkillMock).toHaveBeenCalledTimes(3);
    const names = upsertSkillMock.mock.calls.map((c: unknown[]) => c[1] as string).sort();
    expect(names).toEqual(["a", "b", "c"]);
  });

  test("每个 upsertSkill 调用应包含正确的 description 和 contentPath", async () => {
    await importSkillDirectories({ teamId: "test-team", userId: "user_1", role: "owner" }, [makeFile("my-skill")]);

    const calls = upsertSkillMock.mock.calls as unknown as [{ userId: string }, string, Record<string, unknown>][];
    const [ctx, name, data] = calls[0];
    expect(ctx.userId).toBe("user_1");
    expect(name).toBe("my-skill");
    expect(data.description).toBe("desc-my-skill");
    expect(data.contentPath).toBe("/path/my-skill/SKILL.md");
    expect(data.enabled).toBe(true);
  });
});
