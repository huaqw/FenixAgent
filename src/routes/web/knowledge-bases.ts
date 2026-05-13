import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import {
  createKnowledgeBaseRecord,
  deleteKnowledgeBase,
  getKnowledgeBaseDetail,
  listKnowledgeBasesByUserId,
  updateKnowledgeBase,
} from "../../services/knowledge-base";
import {
  deleteKnowledgeResource,
  importKnowledgeResourceFromUrl,
  listKnowledgeResources,
  uploadKnowledgeResource,
} from "../../services/knowledge-upload";

const app = new Elysia({ name: "web-knowledge-bases", prefix: "/web" })
  .use(authGuardPlugin);

app.get("/knowledge-bases", async ({ store }) => {
  const user = store.user!;
  return await listKnowledgeBasesByUserId(user.id);
}, { sessionAuth: true });

app.post("/knowledge-bases", async ({ store, body, error }) => {
  const user = store.user!;
  const payload = (body as any) ?? {};
  const result = await createKnowledgeBaseRecord(user.id, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
  });
  if (!result.success) {
    return error(400, { error: { type: result.error.code, message: result.error.message } });
  }
  return result.data;
}, { sessionAuth: true });

app.get("/knowledge-bases/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  const detail = await getKnowledgeBaseDetail(user.id, id);
  if (!detail) {
    return error(404, { error: { type: "NOT_FOUND", message: "知识库不存在" } });
  }
  return detail;
}, { sessionAuth: true });

app.patch("/knowledge-bases/:id", async ({ store, params, body, error }) => {
  const user = store.user!;
  const id = params.id;
  const payload = (body as any) ?? {};
  const result = await updateKnowledgeBase(user.id, id, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
  });
  if (!result.success) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 400;
    return error(status, { error: { type: result.error.code, message: result.error.message } });
  }
  return result.data;
}, { sessionAuth: true });

app.delete("/knowledge-bases/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  try {
    const result = await deleteKnowledgeBase(user.id, id);
    if (!result.success) {
      return error(404, { error: { type: "NOT_FOUND", message: result.error.message } });
    }
    return { ok: true };
  } catch (err) {
    return error(400, {
      error: {
        type: "DELETE_FAILED",
        message: err instanceof Error ? err.message : "删除知识库失败",
      },
    });
  }
}, { sessionAuth: true });

app.post("/knowledge-bases/:id/resources/upload", async ({ store, params, request, error }) => {
  const user = store.user!;
  const id = params.id;
  try {
    const form = await request.formData();
    const files = Array.from(form.getAll("files")).filter((entry: any): entry is globalThis.File => entry instanceof globalThis.File);
    const items = await Promise.all(files.map((file) => uploadKnowledgeResource(user.id, id, file as unknown as File)));

    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.status !== "error") {
        continue;
      }
      await deleteKnowledgeResource(user.id, id, items[index]!.id);
      items[index] = await uploadKnowledgeResource(user.id, id, files[index]! as unknown as File);
    }

    const failedItem = items.find((item) => item.status === "error");
    if (failedItem) {
      throw new Error(failedItem.lastError || `${failedItem.sourceName} 上传失败`);
    }
    return { items };
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("不存在") ? 404 : 400;
    return error(status, { error: { type: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } });
  }
}, { sessionAuth: true });

app.post("/knowledge-bases/:id/resources/url", async ({ store, params, body, error }) => {
  const user = store.user!;
  const id = params.id;
  const payload = (body as any) ?? {};
  if (!payload.url || typeof payload.url !== "string") {
    return error(400, { error: { type: "VALIDATION_ERROR", message: "url 为必填字段" } });
  }
  try {
    const item = await importKnowledgeResourceFromUrl(user.id, id, {
      url: payload.url,
      sourceName: payload.sourceName,
    });
    const status = item.status === "error" ? 502 : 201;
    if (status >= 400) return error(status, item);
    return item;
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("不存在") ? 404 : 400;
    return error(status, { error: { type: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } });
  }
}, { sessionAuth: true });

app.get("/knowledge-bases/:id/resources", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  const items = await listKnowledgeResources(user.id, id);
  if (!items) {
    return error(404, { error: { type: "NOT_FOUND", message: "知识库不存在" } });
  }
  return items;
}, { sessionAuth: true });

app.delete("/knowledge-bases/:id/resources/:resourceId", async ({ store, params, error }) => {
  const user = store.user!;
  const id = params.id;
  const resourceId = params.resourceId;
  try {
    const result = await deleteKnowledgeResource(user.id, id, resourceId);
    if (!result.success) {
      return error(404, { error: { type: result.error.code, message: result.error.message } });
    }
    return result.data;
  } catch (err) {
    return error(400, {
      error: {
        type: "DELETE_FAILED",
        message: err instanceof Error ? err.message : "删除资源失败",
      },
    });
  }
}, { sessionAuth: true });

export default app;
