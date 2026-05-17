import { treaty } from "@elysiajs/eden";
import type { App } from "@server/index";

export const client = treaty<App>(
  typeof globalThis.window !== "undefined" ? globalThis.window.location.origin : "",
  { fetch: { credentials: "include" } },
);

// --- SSE 辅助函数（Eden 不原生支持 SSE） ---

export function createSessionEventSource(sessionId: string): EventSource {
  const uuid = getUuid();
  const activeTeamId = localStorage.getItem("active_team_id");
  const params = new URLSearchParams();
  if (uuid) params.set("uuid", uuid);
  if (activeTeamId) params.set("activeTeamId", activeTeamId);
  const query = params.toString();
  const url = query ? `/web/sessions/${sessionId}/events?${query}` : `/web/sessions/${sessionId}/events`;
  return new EventSource(url, { withCredentials: true });
}

// --- FormData 上传辅助函数 ---

export async function fetchUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    const errInfo = data.error || { type: "unknown", message: res.statusText };
    const err = new Error(errInfo.message || errInfo.type) as Error & { code?: string; data?: unknown };
    if (errInfo && typeof errInfo === "object" && "code" in errInfo) {
      err.code = (errInfo as Record<string, unknown>).code as string;
    }
    if (data.data !== undefined) {
      err.data = data.data;
    }
    throw err;
  }
  return data as T;
}

// --- S3 Presigned URL 上传辅助函数 ---

/** 通过 presigned URL 直传文件到 S3（不经过 RCS 服务器中转） */
export async function uploadToPresignedUrl(url: string, file: File, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

// --- UUID 存储辅助函数 ---

const UUID_KEY = "rcs_uuid";

export function getUuid(): string {
  return localStorage.getItem(UUID_KEY) || "";
}

export function setUuid(uuid: string): void {
  localStorage.setItem(UUID_KEY, uuid);
}
