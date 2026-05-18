import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { config } from "../../config";
import * as s3 from "../../services/s3-storage";
import type { S3PresignPutBody, S3DeleteBody } from "../../schemas/s3-file.schema";

const app = new Elysia({ name: "web-s3-files", prefix: "/web/s3" }).use(authGuardPlugin).onBeforeHandle(({ error }) => {
  if (!config.s3.enabled) {
    return error(503, { error: { type: "service_unavailable", message: "S3 storage is not enabled" } });
  }
});

// 列出会话文件
app.get(
  "/files",
  async ({ query, error }) => {
    const q = query as Record<string, string | undefined>;
    const sessionId = q.sessionId;
    const prefix = q.prefix || "";
    if (!sessionId) return error(400, { error: { type: "validation_error", message: "sessionId is required" } });

    const objects = await s3.listSessionFiles(sessionId, prefix);
    const sessionPrefix = `sessions/${sessionId}/`;
    const offset = sessionPrefix.length + (prefix ? prefix.length + 1 : 0);
    const entries = objects.map((obj) => ({
      key: obj.key,
      name: obj.key.slice(offset),
      size: obj.size,
      lastModified: obj.lastModified.getTime(),
    }));

    return { entries, prefix };
  },
  { sessionAuth: true },
);

// 获取下载 presigned URL
app.get(
  "/files/presign",
  async ({ query, error }) => {
    const q = query as Record<string, string | undefined>;
    const sessionId = q.sessionId;
    const key = q.key;
    if (!sessionId || !key)
      return error(400, { error: { type: "validation_error", message: "sessionId and key are required" } });

    const url = await s3.getSessionFileUrl(sessionId, key);
    const expiresAt = Date.now() + config.s3.presignExpires * 1000;
    return { url, key, expiresAt };
  },
  { sessionAuth: true },
);

// 获取上传 presigned URL
app.post(
  "/files/presign",
  async ({ body, error }) => {
    const b = body as S3PresignPutBody;
    if (!b.sessionId || !b.key || !b.contentType) {
      return error(400, {
        error: { type: "validation_error", message: "sessionId, key and contentType are required" },
      });
    }

    const url = await s3.getSessionUploadUrl(b.sessionId, b.key, b.contentType);
    const expiresAt = Date.now() + config.s3.presignUploadExpires * 1000;
    return { url, key: b.key, expiresAt };
  },
  { sessionAuth: true },
);

// 服务端中转上传（fallback，用于浏览器无法直连 S3 的场景）
app.post(
  "/files/upload",
  async ({ query, request, error }) => {
    const q = query as Record<string, string | undefined>;
    const sessionId = q.sessionId;
    if (!sessionId)
      return error(400, { error: { type: "validation_error", message: "sessionId query param is required" } });

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return error(400, { error: { type: "validation_error", message: "No files provided" } });
    }

    const uploaded: Array<{ key: string; name: string; size: number }> = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      await s3.uploadSessionFile(sessionId, file.name, buffer, file.type || undefined);
      uploaded.push({
        key: `sessions/${sessionId}/${file.name}`,
        name: file.name,
        size: buffer.length,
      });
    }
    return { files: uploaded };
  },
  { sessionAuth: true },
);

// 删除文件
app.delete(
  "/files",
  async ({ body, error }) => {
    const b = body as S3DeleteBody;
    if (!b.sessionId || !b.key) {
      return error(400, { error: { type: "validation_error", message: "sessionId and key are required" } });
    }

    await s3.deleteSessionFile(b.sessionId, b.key);
    return { ok: true as const };
  },
  { sessionAuth: true },
);

export default app;
