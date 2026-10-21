ALTER TABLE "notifications" DROP CONSTRAINT "notifications_valid_type";--> statement-breakpoint
ALTER TABLE "idea_history" ALTER COLUMN "collaborator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "archive_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "installation_settings" ADD COLUMN "auto_archive_days" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_valid_type" CHECK ("notifications"."type" in ('status','duplicate','comment','reply','mention','new_idea','stalled','stalled_escalated','archive_warning'));--> statement-breakpoint
ALTER TABLE "installation_settings" ADD CONSTRAINT "installation_settings_valid_auto_archive_days" CHECK ("installation_settings"."auto_archive_days" is null or "installation_settings"."auto_archive_days" > 0);