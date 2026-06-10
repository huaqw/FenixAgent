import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { HindsightStatusResponseSchema } from "../../schemas";
import { getHindsightConfig, proxyToHindsight, resolveMemberId } from "../../services/hindsight";

/** 构造 Hindsight v1 bank 路径前缀：/v1/default/banks/{bankId} */
const bankPath = (bankId: string) => `/v1/default/banks/${encodeURIComponent(bankId)}`;

/** 拼接 query string，空参数返回原始 base */
const withQs = (base: string, query: Record<string, string>) => {
  const qs = new URLSearchParams(query);
  return qs.toString() ? `${base}?${qs.toString()}` : base;
};

const app = new Elysia({ name: "web-hindsight", prefix: "/hindsight" })
  .use(authGuardPlugin)
  .model({
    "hindsight-status-response": HindsightStatusResponseSchema,
  })

  // ── Status ──────────────────────────────────────────────
  // 检查 Hindsight 配置状态，尝试解析 bankId
  .get(
    "/status",
    async ({ store }) => {
      const config = getHindsightConfig();
      let bankId: string | null = null;
      if (config && store.authContext) {
        bankId = await resolveMemberId(store.authContext);
      }
      return {
        success: true as const,
        data: config
          ? ({ enabled: true as const, url: config.url, bankId } as const)
          : ({ enabled: false as const } as const),
      };
    },
    {
      response: "hindsight-status-response",
      detail: {
        tags: ["Hindsight"],
        summary: "获取 Hindsight 状态",
        description: "返回当前 Hindsight 服务是否已启用，以及启用时对应的服务地址和当前用户映射的 bankId。",
      },
    },
  )

  // ── Graph ───────────────────────────────────────────────
  // 获取内存图谱数据，GET 方法，参数通过 query string 传递
  .get(
    "/graph",
    async ({ query, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(withQs(`${bankPath(bankId)}/graph`, query as Record<string, string>));
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /graph proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // ── Bank Stats ──────────────────────────────────────────
  .get(
    "/bank-stats",
    async ({ store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/stats`);
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /bank-stats proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // ── Memories ────────────────────────────────────────────
  // 列出 memories：转发到 /v1/.../memories/list
  .get(
    "/memories",
    async ({ query, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(
          withQs(`${bankPath(bankId)}/memories/list`, query as Record<string, string>),
        );
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /memories proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 获取单个 memory
  .get(
    "/memories/:id",
    async ({ params, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/memories/${params.id}`);
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /memories/:id proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 删除 memory
  .delete(
    "/memories/:id",
    async ({ params, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/memories/${params.id}`, { method: "DELETE" });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] DELETE /memories/:id proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 创建/保留 memory（retain），body 直接透传（不再注入 bank_id）
  .post(
    "/memories",
    async ({ body, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/memories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] POST /memories proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // ── Recall & Reflect ────────────────────────────────────
  // Recall: 语义检索记忆，转发到 /v1/.../memories/recall
  .post(
    "/recall",
    async ({ body, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/memories/recall`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] POST /recall proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // Reflect: 触发反思/整合，转发到 /v1/.../reflect
  .post(
    "/reflect",
    async ({ body, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/reflect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] POST /reflect proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // ── Documents ───────────────────────────────────────────
  // 列出文档
  .get(
    "/documents",
    async ({ query, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(withQs(`${bankPath(bankId)}/documents`, query as Record<string, string>));
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /documents proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 上传文档（multipart/form-data 转发）
  .post(
    "/documents",
    async ({ body, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        // Elysia 自动解析 multipart body，重构 FormData 转发给 Hindsight
        const fd = new FormData();
        const parsed = body as Record<string, unknown>;
        for (const [key, value] of Object.entries(parsed)) {
          if (value instanceof Blob) {
            fd.append(key, value);
          } else if (typeof value === "string") {
            fd.append(key, value);
          }
        }
        const res = await proxyToHindsight(`${bankPath(bankId)}/documents`, {
          method: "POST",
          body: fd,
        });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] POST /documents proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 删除文档
  .delete(
    "/documents/:id",
    async ({ params, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/documents/${params.id}`, { method: "DELETE" });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] DELETE /documents/:id proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 获取文档分块
  .get(
    "/documents/:id/chunks",
    async ({ params, query, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(
          withQs(`${bankPath(bankId)}/documents/${params.id}/chunks`, query as Record<string, string>),
        );
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /documents/:id/chunks proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // ── Mental Models ───────────────────────────────────────
  // 列出 mental models
  .get(
    "/mental-models",
    async ({ store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/mental-models`);
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /mental-models proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 获取单个 mental model
  .get(
    "/mental-models/:id",
    async ({ params, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/mental-models/${params.id}`);
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /mental-models/:id proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 删除 mental model
  .delete(
    "/mental-models/:id",
    async ({ params, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/mental-models/${params.id}`, { method: "DELETE" });
        return await res.json();
      } catch (err) {
        console.error("[hindsight] DELETE /mental-models/:id proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // ── Entities ────────────────────────────────────────────
  // 列出实体
  .get(
    "/entities",
    async ({ query, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(withQs(`${bankPath(bankId)}/entities`, query as Record<string, string>));
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /entities proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 获取单个实体详情
  .get(
    "/entities/:id",
    async ({ params, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(`${bankPath(bankId)}/entities/${params.id}`);
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /entities/:id proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  )

  // 获取实体共现图谱
  .get(
    "/entities/graph",
    async ({ query, store, error }) => {
      const bankId = await resolveMemberId(store.authContext!);
      if (!bankId) return error(403, { error: { type: "forbidden", message: "Cannot resolve bank ID" } });
      try {
        const res = await proxyToHindsight(
          withQs(`${bankPath(bankId)}/entities/graph`, query as Record<string, string>),
        );
        return await res.json();
      } catch (err) {
        console.error("[hindsight] GET /entities/graph proxy failed:", err);
        return error(503, { error: { type: "service_unavailable", message: "Hindsight service unavailable" } });
      }
    },
    { sessionAuth: true },
  );

export default app;
