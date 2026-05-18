import * as z from "zod/v4";

/** POST /v1/sessions — 创建 session 请求体 */
export const CreateSessionRequestSchema = z.object({
  environment_id: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  username: z.string().optional(),
  events: z.array(z.record(z.string(), z.unknown())).optional(),
});

/** PATCH /v1/sessions/:id — 更新 session 标题 */
export const UpdateSessionRequestSchema = z.object({
  title: z.string().min(1).optional(),
});

/** POST /v1/sessions/:id/events — 向 session 发送事件 */
export const SendEventsRequestSchema = z.object({
  events: z.union([z.array(z.record(z.string(), z.unknown())), z.record(z.string(), z.unknown())]).optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>;
export type SendEventsRequest = z.infer<typeof SendEventsRequestSchema>;
