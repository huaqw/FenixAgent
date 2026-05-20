/**
 * skill.ts — Skill 编排层（PG 元数据 + 文件系统内容）。
 *
 * 全局 Skill 和 Workspace Skill 的业务逻辑，
 * 文件系统操作全部委托给 skill-fs.ts。
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";
import { error as logError } from "../logger";
import type { AuthContext } from "../plugins/auth";
import { environmentRepo as _environmentRepo } from "../repositories";
import * as _configPg from "./config-pg";
import {
  backupSkillDirs as _backupSkillDirs,
  assertValidSkillName as _assertValidSkillName,
  buildImportedSkillInfos as _buildImportedSkillInfos,
  buildSkillArchive as _buildSkillArchive,
  cleanupBackupDir as _cleanupBackupDir,
  cleanupWrittenSkills as _cleanupWrittenSkills,
  createBackupDir as _createBackupDir,
  createSkillValidationError as _createSkillValidationError,
  deleteSkillArchive as _deleteSkillArchive,
  deleteSkillDir as _deleteSkillDir,
  getSkillArchivePath as _getSkillArchivePath,
  getSkillSourceDir as _getSkillSourceDir,
  groupUploadFiles as _groupUploadFiles,
  listSkillsFromDir as _listSkillsFromDir,
  readSkillDetailFromMd as _readSkillDetailFromMd,
  resolveImportPlan as _resolveImportPlan,
  restoreFromBackup as _restoreFromBackup,
  writeImportFiles as _writeImportFiles,
  writeSkillMd as _writeSkillMd,
} from "./skill-fs";

// ────────────────────────────────────────────
// 可替换依赖（测试时注入 mock）
// ────────────────────────────────────────────

export const _deps = {
  environmentRepo: _environmentRepo,
  configPg: _configPg,
  skillFs: {
    assertValidSkillName: _assertValidSkillName,
    getSkillSourceDir: _getSkillSourceDir,
    getSkillArchivePath: _getSkillArchivePath,
    buildSkillArchive: _buildSkillArchive,
    deleteSkillArchive: _deleteSkillArchive,
    createSkillValidationError: _createSkillValidationError,
    groupUploadFiles: _groupUploadFiles,
    listSkillsFromDir: _listSkillsFromDir,
    readSkillDetailFromMd: _readSkillDetailFromMd,
    writeSkillMd: _writeSkillMd,
    deleteSkillDir: _deleteSkillDir,
    resolveImportPlan: _resolveImportPlan,
    writeImportFiles: _writeImportFiles,
    buildImportedSkillInfos: _buildImportedSkillInfos,
    backupSkillDirs: _backupSkillDirs,
    cleanupWrittenSkills: _cleanupWrittenSkills,
    restoreFromBackup: _restoreFromBackup,
    createBackupDir: _createBackupDir,
    cleanupBackupDir: _cleanupBackupDir,
  },
};

export function _resetDeps() {
  _deps.environmentRepo = _environmentRepo;
  _deps.configPg = _configPg;
  _deps.skillFs = {
    assertValidSkillName: _assertValidSkillName,
    getSkillSourceDir: _getSkillSourceDir,
    getSkillArchivePath: _getSkillArchivePath,
    buildSkillArchive: _buildSkillArchive,
    deleteSkillArchive: _deleteSkillArchive,
    createSkillValidationError: _createSkillValidationError,
    groupUploadFiles: _groupUploadFiles,
    listSkillsFromDir: _listSkillsFromDir,
    readSkillDetailFromMd: _readSkillDetailFromMd,
    writeSkillMd: _writeSkillMd,
    deleteSkillDir: _deleteSkillDir,
    resolveImportPlan: _resolveImportPlan,
    writeImportFiles: _writeImportFiles,
    buildImportedSkillInfos: _buildImportedSkillInfos,
    backupSkillDirs: _backupSkillDirs,
    cleanupWrittenSkills: _cleanupWrittenSkills,
    restoreFromBackup: _restoreFromBackup,
    createBackupDir: _createBackupDir,
    cleanupBackupDir: _cleanupBackupDir,
  };
}

import type {
  ImportConflictStrategy,
  ImportSkillsConflict,
  ImportSkillsResult,
  SkillDetail,
  SkillInfo,
  UploadSkillFile,
} from "./skill-fs";

// 重新导出类型，保持外部导入兼容
export type {
  ImportConflictStrategy,
  ImportSkillsConflict,
  ImportSkillsResult,
  SkillDetail,
  SkillInfo,
  UploadSkillFile,
} from "./skill-fs";

export function getGlobalSkillsDir(): string {
  return config.skillDir;
}

// --- Workspace Skill Sources ---

export type SkillSourceStatus = "online" | "offline" | "timeout";

export interface SkillSourceInfo {
  type: "global" | "workspace";
  id?: string;
  name: string;
  path: string;
  status: SkillSourceStatus;
  skills: SkillInfo[];
}

// ────────────────────────────────────────────
// 全局 Skill 函数（PG 元数据 + 文件系统内容）
// ────────────────────────────────────────────

function skillContentPath(name: string): string {
  const safeName = _deps.skillFs.assertValidSkillName(name);
  return join(_deps.skillFs.getSkillSourceDir(getGlobalSkillsDir(), safeName), "SKILL.md");
}

/** 过滤 metadata 中的 name 和 description 字段 */
function stripNameAndDescription(metadata: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).filter(([k]) => k !== "name" && k !== "description"));
}

export async function listSkills(ctx: AuthContext): Promise<SkillInfo[]> {
  const rows = await _deps.configPg.listSkills(ctx);
  return rows.map((r) => ({
    name: r.name,
    enabled: r.enabled,
    description: r.description ?? "",
    path: r.contentPath ?? skillContentPath(r.name),
  }));
}

export async function getSkill(ctx: AuthContext, name: string): Promise<SkillDetail | null> {
  const safeName = _deps.skillFs.assertValidSkillName(name);
  const meta = await _deps.configPg.getSkill(ctx, safeName);
  if (!meta) return null;

  const contentPath = meta.contentPath ?? skillContentPath(safeName);
  const detail = await _deps.skillFs.readSkillDetailFromMd(contentPath);

  return {
    name: safeName,
    description: meta.description ?? detail?.metadata.description ?? "",
    content: detail?.content ?? "",
    enabled: meta.enabled,
    path: contentPath,
    metadata: stripNameAndDescription(detail?.metadata ?? {}),
  };
}

export async function setSkill(
  ctx: AuthContext,
  name: string,
  data: { description: string; content: string; metadata?: Record<string, string> },
): Promise<SkillInfo> {
  const safeName = _deps.skillFs.assertValidSkillName(name);
  const root = getGlobalSkillsDir();
  const skillDir = _deps.skillFs.getSkillSourceDir(root, safeName);
  const archivePath = _deps.skillFs.getSkillArchivePath(root, safeName);
  const backupRoot = await _deps.skillFs.createBackupDir("rcs-skill-set-");
  const snapshots = await _deps.skillFs.backupSkillDirs(backupRoot, root, [safeName]);

  try {
    const contentPath = await _deps.skillFs.writeSkillMd(
      skillDir,
      safeName,
      data.description,
      data.content,
      data.metadata,
    );
    await _deps.skillFs.buildSkillArchive(skillDir, archivePath);
    await _deps.configPg.upsertSkill(ctx, safeName, {
      description: data.description,
      contentPath,
      metadata: data.metadata,
      enabled: true,
    });

    return { name: safeName, enabled: true, description: data.description, path: contentPath };
  } catch (err) {
    await _deps.skillFs.cleanupWrittenSkills(root, [safeName]).catch((e) => {
      logError("[Skill] Failed to cleanup skill directory after setSkill failure:", e);
    });
    await _deps.skillFs.restoreFromBackup(snapshots, root).catch((e) => {
      logError("[Skill] Failed to restore skill backup after setSkill failure:", e);
    });
    const snapshot = snapshots.get(safeName);
    if (snapshot) {
      await _deps.skillFs.buildSkillArchive(skillDir, archivePath).catch((e) => {
        logError("[Skill] Failed to rebuild restored skill archive:", e);
      });
    } else {
      await _deps.skillFs.deleteSkillArchive(root, safeName).catch((e) => {
        logError("[Skill] Failed to cleanup skill archive after setSkill failure:", e);
      });
    }
    throw err;
  } finally {
    await _deps.skillFs.cleanupBackupDir(backupRoot).catch((e) => {
      logError("[Skill] Failed to cleanup setSkill backup dir:", e);
    });
  }
}

export async function deleteSkill(ctx: AuthContext, name: string): Promise<boolean> {
  const safeName = _deps.skillFs.assertValidSkillName(name);
  const deleted = await _deps.configPg.deleteSkill(ctx, safeName);
  if (!deleted) return false;
  const root = getGlobalSkillsDir();
  const skillDir = _deps.skillFs.getSkillSourceDir(root, safeName);
  await _deps.skillFs.deleteSkillDir(skillDir).catch((e) => {
    logError(`[Skill] Failed to cleanup skill directory ${skillDir}:`, e);
  });
  await _deps.skillFs.deleteSkillArchive(root, safeName).catch((e) => {
    logError(`[Skill] Failed to cleanup skill archive ${safeName}:`, e);
  });
  return true;
}

export async function enableSkill(ctx: AuthContext, name: string): Promise<boolean> {
  const safeName = _deps.skillFs.assertValidSkillName(name);
  const meta = await _deps.configPg.getSkill(ctx, safeName);
  if (!meta) return false;
  const root = getGlobalSkillsDir();
  const sourceDir = _deps.skillFs.getSkillSourceDir(root, safeName);
  await _deps.skillFs.buildSkillArchive(sourceDir, _deps.skillFs.getSkillArchivePath(root, safeName));
  return _deps.configPg.enableSkill(ctx, safeName);
}

export async function disableSkill(ctx: AuthContext, name: string): Promise<boolean> {
  const safeName = _deps.skillFs.assertValidSkillName(name);
  return _deps.configPg.disableSkill(ctx, safeName);
}

/** 校验上传文件并检测冲突（全局和 workspace 共享） */
function validateImportFiles(files: UploadSkillFile[]): Map<string, UploadSkillFile[]> {
  if (files.length === 0) {
    throw _deps.skillFs.createSkillValidationError("未提供任何上传文件");
  }
  const grouped = _deps.skillFs.groupUploadFiles(files);
  if (grouped.size === 0) {
    throw _deps.skillFs.createSkillValidationError("未解析出任何 skill");
  }
  for (const [name, skillFiles] of grouped) {
    if (!skillFiles.some((file) => file.relativePath === "SKILL.md")) {
      throw _deps.skillFs.createSkillValidationError(`Skill "${name}" 缺少 SKILL.md`);
    }
  }
  return grouped;
}

/** 通用导入核心：备份→写入→回滚（全局和 workspace 共享） */
async function executeImportCore(
  targetDir: string,
  pendingEntries: [string, UploadSkillFile[]][],
  overwriteNames: string[],
  backupPrefix: string,
  onConflictCleanup?: (names: string[]) => Promise<void>,
  onSkillWritten?: (info: { name: string; description: string; path: string }) => Promise<void>,
  onRollbackCleanup?: (names: string[]) => Promise<void>,
  onRestoreComplete?: (names: string[]) => Promise<void>,
): Promise<ImportSkillsResult> {
  const backupRoot = await _deps.skillFs.createBackupDir(backupPrefix);
  const snapshots = new Map<string, string | null>();
  const attemptedNames: string[] = [];

  try {
    if (overwriteNames.length > 0) {
      const backed = await _deps.skillFs.backupSkillDirs(backupRoot, targetDir, overwriteNames);
      for (const [bName, bPath] of backed) snapshots.set(bName, bPath);
      await _deps.skillFs.cleanupWrittenSkills(targetDir, overwriteNames);
      if (onConflictCleanup) await onConflictCleanup(overwriteNames);
    }

    const writtenNames = await _deps.skillFs.writeImportFiles(targetDir, pendingEntries);
    attemptedNames.push(...writtenNames);

    const imported = await _deps.skillFs.buildImportedSkillInfos(targetDir, writtenNames);

    if (onSkillWritten) {
      await Promise.all(imported.map((info) => onSkillWritten(info)));
    }

    return { imported, skipped: [], conflicts: [] };
  } catch (err) {
    try {
      await _deps.skillFs.cleanupWrittenSkills(targetDir, attemptedNames);
    } catch (e) {
      logError("[Skill] Failed to cleanup written skills:", e);
    }
    if (onRollbackCleanup) {
      await onRollbackCleanup(attemptedNames).catch((e) => {
        logError("[Skill] Failed to rollback PG records:", e);
      });
    }
    try {
      await _deps.skillFs.restoreFromBackup(snapshots, targetDir);
      if (onRestoreComplete && snapshots.size > 0) {
        await onRestoreComplete([...snapshots.keys()]);
      }
    } catch (e) {
      logError("[Skill] Failed to restore from backup:", e);
    }
    throw err;
  } finally {
    try {
      await _deps.skillFs.cleanupBackupDir(backupRoot);
    } catch (e) {
      logError("[Skill] Failed to cleanup backup dir:", e);
    }
  }
}

export async function importSkillDirectories(
  ctx: AuthContext,
  files: UploadSkillFile[],
  strategy?: ImportConflictStrategy,
): Promise<ImportSkillsResult> {
  const grouped = validateImportFiles(files);
  const root = getGlobalSkillsDir();

  // 并行检测冲突（N+1 → 单轮并行查询）
  const entries = Array.from(grouped.entries());
  const existingResults = await Promise.all(
    entries.map(async ([name]) => {
      const existing = await _deps.configPg.getSkill(ctx, name);
      return existing
        ? { name, enabled: existing.enabled, path: existing.contentPath ?? skillContentPath(name) }
        : null;
    }),
  );
  const conflicts: ImportSkillsConflict[] = existingResults.filter((r): r is ImportSkillsConflict => r !== null);

  if (conflicts.length > 0 && !strategy) {
    return { imported: [], skipped: [], conflicts };
  }

  const { pendingEntries, skipped } = _deps.skillFs.resolveImportPlan(grouped, conflicts, strategy);

  if (pendingEntries.length === 0) {
    return { imported: [], skipped, conflicts: [] };
  }

  const conflictNames = new Set(conflicts.map((item) => item.name));
  const overwriteNames = pendingEntries.filter(([name]) => conflictNames.has(name)).map(([name]) => name);

  const result = await executeImportCore(
    root,
    pendingEntries,
    strategy === "overwrite" ? overwriteNames : [],
    "rcs-skill-import-",
    // onConflictCleanup: overwrite 时清理 PG 冲突记录（pre-write）
    strategy === "overwrite"
      ? async (names) => {
          await Promise.all(names.map((name) => _deps.configPg.deleteSkill(ctx, name)));
        }
      : undefined,
    // onSkillWritten: 并行写入 PG 元数据
    async (info) => {
      await _deps.skillFs.buildSkillArchive(
        _deps.skillFs.getSkillSourceDir(root, info.name),
        _deps.skillFs.getSkillArchivePath(root, info.name),
      );
      await _deps.configPg.upsertSkill(ctx, info.name, {
        description: info.description,
        contentPath: info.path,
        enabled: true,
      });
    },
    // onRollbackCleanup: 回滚时清理已尝试写入的 PG 记录
    async (names) => {
      await Promise.all([
        ...names.map((name) => _deps.configPg.deleteSkill(ctx, name)),
        ...names.map((name) => _deps.skillFs.deleteSkillArchive(root, name)),
      ]);
    },
    async (names) => {
      await Promise.all(
        names.map((name) =>
          _deps.skillFs.buildSkillArchive(
            _deps.skillFs.getSkillSourceDir(root, name),
            _deps.skillFs.getSkillArchivePath(root, name),
          ),
        ),
      );
    },
  );

  return { ...result, skipped };
}
// ────────────────────────────────────────────

const WORKSPACE_SCAN_TIMEOUT_MS = 2000;

function getWorkspaceSkillDir(workspacePath: string): string {
  return join(workspacePath, ".agents", "skills");
}

export async function listWorkspaceSkills(workspacePath: string): Promise<SkillInfo[]> {
  const skillsDir = getWorkspaceSkillDir(workspacePath);
  return _deps.skillFs.listSkillsFromDir(skillsDir);
}

export async function listSkillSources(ctx: AuthContext): Promise<SkillSourceInfo[]> {
  // 两个查询无依赖关系，并行执行
  const [environments, globalSkills] = await Promise.all([
    _deps.environmentRepo.listByUserId(ctx.userId),
    listSkills(ctx),
  ]);
  const sources: SkillSourceInfo[] = [
    {
      type: "global",
      name: "全局技能",
      path: getGlobalSkillsDir(),
      status: "online",
      skills: globalSkills,
    },
  ];

  if (environments.length === 0) return sources;

  // 仅扫描拥有 workspacePath 的环境，避免 ACP 环境传入 null 导致 path.join 异常
  const workspaceEnvs = environments.filter((env) => !!env.workspacePath);
  if (workspaceEnvs.length === 0) return sources;

  const results = await Promise.allSettled(
    workspaceEnvs.map(async (env) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const skills = await Promise.race([
          listWorkspaceSkills(env.workspacePath!),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("TIMEOUT")), WORKSPACE_SCAN_TIMEOUT_MS);
          }),
        ]);
        return { env, skills };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const env = workspaceEnvs[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      sources.push({
        type: "workspace",
        id: env.id,
        name: env.name,
        path: env.workspacePath,
        status: env.status === "active" ? "online" : "offline",
        skills: result.value.skills,
      });
    } else {
      const reason = result.reason;
      const isTimeout = reason instanceof Error && reason.message === "TIMEOUT";
      sources.push({
        type: "workspace",
        id: env.id,
        name: env.name,
        path: env.workspacePath,
        status: isTimeout ? "timeout" : "offline",
        skills: [],
      });
    }
  }
  return sources;
}

export async function getWorkspaceSkill(workspacePath: string, name: string): Promise<SkillDetail | null> {
  const skillsDir = getWorkspaceSkillDir(workspacePath);
  const mdPath = join(skillsDir, name, "SKILL.md");
  const detail = await _deps.skillFs.readSkillDetailFromMd(mdPath);
  if (!detail) return null;

  return {
    name,
    description: detail.metadata.description ?? "",
    content: detail.content,
    enabled: true,
    path: mdPath,
    metadata: stripNameAndDescription(detail.metadata),
  };
}

export async function setWorkspaceSkill(
  workspacePath: string,
  name: string,
  data: { description: string; content: string; metadata?: Record<string, string> },
): Promise<SkillInfo> {
  const skillsDir = getWorkspaceSkillDir(workspacePath);
  await mkdir(skillsDir, { recursive: true });
  const skillDir = join(skillsDir, name);
  const mdPath = await _deps.skillFs.writeSkillMd(skillDir, name, data.description, data.content, data.metadata);
  return { name, enabled: true, description: data.description, path: mdPath };
}

export async function deleteWorkspaceSkill(workspacePath: string, name: string): Promise<boolean> {
  const skillDir = join(getWorkspaceSkillDir(workspacePath), name);
  if (!existsSync(skillDir)) return false;
  await _deps.skillFs.deleteSkillDir(skillDir);
  return true;
}

export async function importWorkspaceSkillDirectories(
  workspacePath: string,
  files: UploadSkillFile[],
  strategy?: ImportConflictStrategy,
): Promise<ImportSkillsResult> {
  const targetDir = getWorkspaceSkillDir(workspacePath);
  const grouped = validateImportFiles(files);

  // workspace skill 冲突检测基于文件系统存在性
  const conflicts: ImportSkillsConflict[] = [];
  for (const [name] of grouped) {
    const skillMdPath = join(targetDir, name, "SKILL.md");
    if (existsSync(skillMdPath)) {
      conflicts.push({ name, enabled: true, path: skillMdPath });
    }
  }

  if (conflicts.length > 0 && !strategy) {
    return { imported: [], skipped: [], conflicts };
  }

  const { pendingEntries, skipped } = _deps.skillFs.resolveImportPlan(grouped, conflicts, strategy);

  if (pendingEntries.length === 0) {
    return { imported: [], skipped, conflicts: [] };
  }

  const conflictNames = new Set(conflicts.map((item) => item.name));
  const overwriteNames = pendingEntries.filter(([name]) => conflictNames.has(name)).map(([name]) => name);

  const result = await executeImportCore(
    targetDir,
    pendingEntries,
    strategy === "overwrite" ? overwriteNames : [],
    "rcs-ws-skill-import-",
  );

  return { ...result, skipped };
}
