import Elysia from "elysia";
import { authGuardPlugin } from "../../plugins/auth";
import {
  createApiKey,
  listApiKeysByUser,
  deleteApiKey,
  updateApiKeyLabel,
} from "../../auth/api-key-service";

const app = new Elysia({ name: "web-api-keys", prefix: "/web" })
  .use(authGuardPlugin);

/** GET /web/api-keys — List current user's API keys */
app.get("/api-keys", async ({ store }) => {
  const user = store.user!;
  const keys = await listApiKeysByUser(user.id);
  return keys;
}, { sessionAuth: true });

/** POST /web/api-keys — Create a new API key */
app.post("/api-keys", async ({ store, body }) => {
  const user = store.user!;
  const b = (body as any) ?? {};
  const { record, fullKey } = await createApiKey(user.id, b.label || "");
  return { ...record, full_key: fullKey };
}, { sessionAuth: true });

/** DELETE /web/api-keys/:id — Delete an API key */
app.delete("/api-keys/:id", async ({ store, params, error }) => {
  const user = store.user!;
  const keyId = params.id;
  const deleted = await deleteApiKey(user.id, keyId);
  if (!deleted) {
    return error(404, { error: { type: "not_found", message: "API key not found" } });
  }
  return { ok: true };
}, { sessionAuth: true });

/** PATCH /web/api-keys/:id — Update API key label */
app.patch("/api-keys/:id", async ({ store, params, body, error }) => {
  const user = store.user!;
  const keyId = params.id;
  const b = (body as any) ?? {};
  if (!b.label) {
    return error(400, { error: { type: "bad_request", message: "Label is required" } });
  }
  const updated = await updateApiKeyLabel(user.id, keyId, b.label);
  if (!updated) {
    return error(404, { error: { type: "not_found", message: "API key not found" } });
  }
  return { ok: true };
}, { sessionAuth: true });

export default app;
