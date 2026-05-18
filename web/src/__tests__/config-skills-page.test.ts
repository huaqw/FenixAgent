import { describe, test, expect } from "bun:test";
import {
  validateSkillForm,
  getUploadResultMessage,
  getUploadConflictData,
  getInvalidUploadSkillNames,
  getUploadItemSummaries,
} from "../pages/SkillsPage";

describe("validateSkillForm", () => {
  test("empty name returns error", () => {
    expect(validateSkillForm("", "content")).toBe("名称不能为空");
  });

  test("empty content returns error", () => {
    expect(validateSkillForm("my-skill", "")).toBe("内容不能为空");
  });

  test("valid form returns null", () => {
    expect(validateSkillForm("my-skill", "# Hello")).toBeNull();
  });
});

describe("getUploadResultMessage", () => {
  test("only imported", () => {
    expect(getUploadResultMessage(2, 0)).toBe("已导入 2 个技能");
  });

  test("imported with skipped", () => {
    expect(getUploadResultMessage(2, 1)).toBe("已导入 2 个技能，跳过 1 个冲突技能");
  });
});

describe("getUploadConflictData", () => {
  test("extracts conflict payload from upload error", () => {
    const error = Object.assign(new Error("冲突"), {
      code: "SKILL_CONFLICT",
      data: {
        conflicts: [{ name: "existing", enabled: true, path: "/tmp/existing/SKILL.md" }],
        allowedStrategies: ["ignore", "overwrite"],
      },
    });
    expect(getUploadConflictData(error)).toEqual(error.data);
  });

  test("returns null for non-conflict error", () => {
    expect(getUploadConflictData(new Error("plain"))).toBeNull();
  });
});

describe("getUploadItemSummaries", () => {
  test("marks invalid item when SKILL.md is missing", () => {
    expect(
      getUploadItemSummaries([
        { skillName: "skill-a", fileCount: 2, hasSkillMd: true, files: [] },
        { skillName: "broken", fileCount: 1, hasSkillMd: false, files: [] },
      ]),
    ).toEqual(["skill-a (2 个文件)", "broken (1 个文件，缺少 SKILL.md)"]);
  });
});

describe("getInvalidUploadSkillNames", () => {
  test("returns only invalid directory names", () => {
    expect(
      getInvalidUploadSkillNames([
        { skillName: "skill-a", fileCount: 2, hasSkillMd: true, files: [] },
        { skillName: "broken", fileCount: 1, hasSkillMd: false, files: [] },
      ]),
    ).toEqual(["broken"]);
  });
});
