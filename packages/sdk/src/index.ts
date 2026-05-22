// @mothership/sdk — 类型安全 REST API 客户端

// 基础类
export { BaseApi } from "./base";

// Result 类型
export type { ApiResult, ApiError, ApiOk, ApiErr } from "./result";
export { ok, err } from "./result";

// 从后端 schema 重导出的类型
export type * from "./types/schemas";
