import { randomBytes } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { mkdirSync, realpathSync } from "node:fs";
import { environmentRepo } from "../repositories";
import type { RegisterEnvironmentRequest, EnvironmentResponse } from "../types/api";
import type { EnvironmentRecord } from "../repositories";

const BLOCKED_PATHS = [
  "/", "/etc", "/usr", "/bin", "/sbin", "/var", "/sys", "/proc",
  "/dev", "/boot", "/lib", "/root",
];

/** 校验 workspace 路径是否安全（不在系统目录下） */
export function validateWorkspacePath(p: string): string | null {
  if (!isAbsolute(p)) return "workspace 路径必须是绝对路径";
  const normalized = resolve(p);
  if (BLOCKED_PATHS.includes(normalized))
    return `不允许使用系统目录: ${normalized}`;
  for (const blocked of BLOCKED_PATHS) {
    if (blocked !== "/" && normalized.startsWith(blocked + "/")) {
      return `不允许使用系统目录下的路径: ${normalized}`;
    }
  }
  return null;
}

/** 确保 workspace 目录存在，返回真实路径 */
export function ensureWorkspaceDir(workspacePath: string): string {
  mkdirSync(workspacePath, { recursive: true });
  return realpathSync(workspacePath);
}

function toResponse(row: EnvironmentRecord): EnvironmentResponse {
  return {
    id: row.id,
    machine_name: row.machineName,
    directory: row.directory,
    branch: row.branch,
    status: row.status,
    username: row.username,
    last_poll_at: row.lastPollAt ? row.lastPollAt.getTime() / 1000 : null,
    worker_type: row.workerType,
    capabilities: row.capabilities,
  };
}

export async function registerEnvironment(req: RegisterEnvironmentRequest & { metadata?: { worker_type?: string }; username?: string; userId?: string }) {
  const secret = `env_${randomBytes(24).toString("hex")}`;
  const workerType = req.worker_type || req.metadata?.worker_type;
  const record = await environmentRepo.create({
    secret,
    userId: req.userId || "system",
    machineName: req.machine_name,
    directory: req.directory,
    branch: req.branch,
    gitRepoUrl: req.git_repo_url,
    maxSessions: req.max_sessions,
    workerType,
    username: req.username,
    capabilities: req.capabilities,
  });

  // Session 由 acp-link 管理，RCS 不再创建
  return { environment_id: record.id, environment_secret: record.secret, status: record.status as "active", session_id: undefined };
}

export async function deregisterEnvironment(envId: string) {
  await environmentRepo.update(envId, { status: "deregistered" });
}

export async function getEnvironment(envId: string) {
  return environmentRepo.getById(envId);
}

export async function updatePollTime(envId: string) {
  await environmentRepo.update(envId, { lastPollAt: new Date() });
}

export async function listActiveEnvironments() {
  return environmentRepo.listActive();
}

export async function listActiveEnvironmentsResponse(): Promise<EnvironmentResponse[]> {
  const envs = await environmentRepo.listActive();
  return envs.map(toResponse);
}

export async function listActiveEnvironmentsByUsername(username: string): Promise<EnvironmentResponse[]> {
  const envs = await environmentRepo.listActiveByUsername(username);
  return envs.map(toResponse);
}

export async function reconnectEnvironment(envId: string) {
  await environmentRepo.update(envId, { status: "active" });
}

/** Delete environment */
export async function deleteEnvironment(envId: string): Promise<boolean> {
  return environmentRepo.delete(envId);
}
