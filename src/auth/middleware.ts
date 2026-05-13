/**
 * Legacy Hono middleware — migrated to src/plugins/auth.ts (Elysia plugin + macro).
 * This file is kept only for backward compatibility with test files that import from it.
 * All production code should use authGuardPlugin from src/plugins/auth.ts.
 */

export async function sessionAuth() {
  throw new Error("sessionAuth migrated to Elysia plugin. Use authGuardPlugin with { sessionAuth: true } macro.");
}

export async function apiKeyAuth() {
  throw new Error("apiKeyAuth migrated to Elysia plugin. Use authGuardPlugin with { apiKeyAuth: true } macro.");
}

export async function uuidAuth() {
  throw new Error("uuidAuth migrated to Elysia plugin. Use authGuardPlugin with { uuidAuth: true } macro.");
}

export async function acceptCliHeaders() {
  // No-op passthrough — was already a no-op in Hono version
}

export async function sessionIngressAuth() {
  throw new Error("sessionIngressAuth migrated to Elysia plugin. Use authGuardPlugin with { sessionIngressAuth: true } macro.");
}

export function getUuidFromRequest() {
  throw new Error("getUuidFromRequest removed. Access uuid from store.uuid in Elysia handler context.");
}
