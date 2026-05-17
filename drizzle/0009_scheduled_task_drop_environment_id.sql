ALTER TABLE "scheduled_task" DROP CONSTRAINT "scheduled_task_environment_id_environment_id_fk";
--> statement-breakpoint
ALTER TABLE "scheduled_task" DROP COLUMN "environment_id";--> statement-breakpoint
ALTER TABLE "task_execution_log" DROP COLUMN "environment_id";--> statement-breakpoint
ALTER TABLE "task_execution_log" DROP COLUMN "environment_name";