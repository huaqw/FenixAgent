import * as z from "zod/v4";

export const TaskInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  cron: z.string(),
  timezone: z.string().nullable(),
  enabled: z.boolean(),
  url: z.string(),
  method: z.string(),
  headers: z.string().nullable(),
  body: z.string().nullable(),
  lastRunAt: z.number().nullable(),
  nextRunAt: z.number().nullable(),
  lastStatus: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const ExecutionLogInfoSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  duration: z.number().nullable(),
  triggeredBy: z.string(),
  taskSnapshot: z.string().nullable(),
  skipReason: z.string().nullable(),
  resultSummary: z.string().nullable(),
  createdAt: z.number(),
});

export const PaginatedLogsSchema = z.object({
  total: z.number(),
  items: ExecutionLogInfoSchema.array(),
});

export const CreateTaskRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  cron: z.string().min(1),
  timezone: z.string().nullable().optional(),
  url: z.string().min(1),
  method: z.string().optional(),
  headers: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
});

export const UpdateTaskRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  cron: z.string().min(1).optional(),
  timezone: z.string().nullable().optional(),
  url: z.string().min(1).optional(),
  method: z.string().optional(),
  headers: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export type TaskInfo = z.infer<typeof TaskInfoSchema>;
export type ExecutionLogInfo = z.infer<typeof ExecutionLogInfoSchema>;
export type PaginatedLogs = z.infer<typeof PaginatedLogsSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;
