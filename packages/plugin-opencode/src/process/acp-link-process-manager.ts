import { spawn, type ChildProcess } from "node:child_process";
import { resolveExecutable } from "./executable";

const LOCAL_WS_TOKEN_PATTERN = /Token:\s*([a-f0-9]{64})/;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const DEFAULT_HOST = "127.0.0.1";
const READYNESS_PROBE_INTERVAL_MS = 200;
const READYNESS_PROBE_MAX_ATTEMPTS = 50;

export type AcpLinkProcessStatus = "starting" | "running" | "stopped" | "error";

export interface StartAcpLinkInput {
  instanceId: string;
  workspace: string;
  port: number;
  env?: Record<string, string>;
}

export interface ManagedAcpLinkProcess {
  instanceId: string;
  process: ChildProcess;
  pid: number | null;
  port: number;
  token: string;
  status: AcpLinkProcessStatus;
}

export interface AcpLinkProcessManagerDependencies {
  resolveExecutable?: (command: string) => string;
  spawn?: typeof spawn;
  stopTimeoutMs?: number;
}

interface ProcessEntry {
  process: ChildProcess;
  port: number;
  token: string | null;
  status: AcpLinkProcessStatus;
  stopPromise: Promise<void> | null;
  stopTimeoutMs: number;
}

/**
 * 负责 opencode runtime 使用的本地 acp-link 子进程生命周期。
 */
export class AcpLinkProcessManager {
  private readonly processes = new Map<string, ProcessEntry>();
  private readonly resolveExecutableImpl: (command: string) => string;
  private readonly spawnImpl: typeof spawn;
  private readonly stopTimeoutMs: number;

  constructor(dependencies: AcpLinkProcessManagerDependencies = {}) {
    this.resolveExecutableImpl = dependencies.resolveExecutable ?? resolveExecutable;
    this.spawnImpl = dependencies.spawn ?? spawn;
    this.stopTimeoutMs = dependencies.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
  }

  async start(input: StartAcpLinkInput): Promise<ManagedAcpLinkProcess> {
    const acpLinkExecutable = this.resolveExecutableImpl("acp-link");
    const opencodeExecutable = this.resolveExecutableImpl("opencode");
    const child = this.spawnImpl(
      acpLinkExecutable,
      ["--host", DEFAULT_HOST, "--port", String(input.port), opencodeExecutable, "--", "acp"],
      {
      cwd: input.workspace,
      env: {
        ...process.env,
        ...input.env,
        ACP_RCS_TOKEN: input.env?.ACP_RCS_TOKEN ?? process.env.ACP_RCS_TOKEN ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const entry: ProcessEntry = {
      process: child,
      port: input.port,
      token: null,
      status: "starting",
      stopPromise: null,
      stopTimeoutMs: this.stopTimeoutMs,
    };
    this.processes.set(input.instanceId, entry);

    child.once("exit", () => {
      if (entry.status !== "error") {
        entry.status = "stopped";
      }
    });
    child.once("error", () => {
      entry.status = "error";
    });

    return await new Promise<ManagedAcpLinkProcess>((resolve, reject) => {
      let settled = false;
      let healthCheckTimer: ReturnType<typeof setInterval> | undefined = undefined;

      const stopHealthCheck = () => {
        if (healthCheckTimer !== undefined) {
          clearInterval(healthCheckTimer);
          healthCheckTimer = undefined;
        }
      };

      const done = (token: string) => {
        if (settled) return;
        settled = true;
        stopHealthCheck();
        entry.token = token;
        entry.status = "running";
        resolve({
          instanceId: input.instanceId,
          process: child,
          pid: child.pid ?? null,
          port: input.port,
          token,
          status: "running",
        });
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        stopHealthCheck();
        entry.status = "error";
        this.processes.set(input.instanceId, entry);
        reject(error);
      };

      child.once("error", fail);

      // 方式 1：从 stdout 捕获 Token（旧版 acp-link 兼容）
      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        const match = text.match(LOCAL_WS_TOKEN_PATTERN);
        if (!match) return;
        done(match[1]);
      });

      // 方式 2：health check 轮询兜底（新版 acp-link 不输出 Token）
      let probeAttempts = 0;
      healthCheckTimer = setInterval(async () => {
        probeAttempts++;
        if (settled) { stopHealthCheck(); return; }
        if (probeAttempts > READYNESS_PROBE_MAX_ATTEMPTS) {
          stopHealthCheck();
          if (!settled) fail(new Error("acp-link readiness probe timed out"));
          return;
        }
        try {
          const res = await fetch(`http://${DEFAULT_HOST}:${input.port}/health`);
          if (res.ok) done("");
        } catch { /* not ready yet */ }
      }, READYNESS_PROBE_INTERVAL_MS);

      child.once("exit", () => {
        if (settled) return;
        fail(new Error("acp-link exited before becoming ready"));
      });
    });
  }

  async stop(instanceId: string): Promise<void> {
    const entry = this.processes.get(instanceId);
    if (!entry || entry.status === "stopped") {
      return;
    }
    if (entry.stopPromise) {
      await entry.stopPromise;
      return;
    }

    entry.stopPromise = new Promise<void>((resolve) => {
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const finalize = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        entry.status = "stopped";
        this.processes.delete(instanceId);
        resolve();
      };

      entry.process.once("exit", finalize);
      entry.process.kill("SIGTERM");

      killTimer = setTimeout(() => {
        if (settled) {
          return;
        }
        entry.process.kill("SIGKILL");
      }, entry.stopTimeoutMs);
    });

    await entry.stopPromise;
  }
}
