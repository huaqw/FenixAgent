import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import { getChannelProvider, listChannelProviders } from "../../services/channel-provider";
import { getHermesClient } from "../../services/hermes-client";
import { listBindings, createBinding, deleteBinding, updateBinding } from "../../services/channel-binding";
import { storeGetEnvironment } from "../../store";

const app = new Elysia({ name: "web-channels", prefix: "/web" })
  .use(authGuardPlugin);

app.get("/channels/providers", () => {
  return listChannelProviders();
}, { sessionAuth: true });

app.get("/channels", () => {
  return [];
}, { sessionAuth: true });

app.post("/channels", async ({ body, error }) => {
  const b = (body as any) ?? {};
  const provider = typeof b?.type === "string" ? getChannelProvider(b.type) : undefined;
  const status = provider ? 409 : 400;
  return error(status, { error: { type: "FORBIDDEN", message: "当前平台暂未开放" } });
}, { sessionAuth: true });

// --- Hermes Status ---

app.get("/channels/hermes/status", () => {
  const client = getHermesClient();
  if (!client) {
    return {
      connected: false,
      url: "",
      platforms: [],
      reconnecting: false,
      lastConnectedAt: null,
    };
  }
  return client.getStatus();
}, { sessionAuth: true });

// --- Bindings CRUD ---

app.get("/channels/bindings", async () => {
  const bindings = await listBindings();
  const enriched = bindings.map((b) => {
    const env = storeGetEnvironment(b.agentId);
    return { ...b, agentName: env?.name ?? null };
  });
  return enriched;
}, { sessionAuth: true });

app.post("/channels/bindings", async ({ body, error }) => {
  const b = (body as any) ?? {};
  const { platform, chatId, agentId, enabled } = b;
  if (!platform || !agentId) {
    return error(400, { error: { type: "VALIDATION_ERROR", message: "platform 和 agentId 为必填字段" } });
  }
  const binding = await createBinding({ platform, chatId: chatId ?? null, agentId, enabled });
  const env = storeGetEnvironment(binding.agentId);
  return { ...binding, agentName: env?.name ?? null };
}, { sessionAuth: true });

app.delete("/channels/bindings/:id", async ({ params, error }) => {
  const id = params.id;
  const deleted = await deleteBinding(id);
  if (!deleted) {
    return error(404, { error: { type: "NOT_FOUND", message: "绑定不存在" } });
  }
  return { success: true };
}, { sessionAuth: true });

app.patch("/channels/bindings/:id", async ({ params, body, error }) => {
  const id = params.id;
  const b = (body as any) ?? {};
  const updated = await updateBinding(id, b);
  if (!updated) {
    return error(404, { error: { type: "NOT_FOUND", message: "绑定不存在" } });
  }
  const env = storeGetEnvironment(updated.agentId);
  return { ...updated, agentName: env?.name ?? null };
}, { sessionAuth: true });

export default app;
