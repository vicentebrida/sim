ALTER TABLE "notifications" DROP CONSTRAINT "notifications_valid_email_status";--> statement-breakpoint
ALTER TABLE "collaborators" ADD COLUMN "email_mode" text DEFAULT 'instant' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_valid_email_status" CHECK ("notifications"."email_status" in ('none','pending','digest','sent','failed'));
--> statement-breakpoint
UPDATE "collaborators" SET "email_mode" = CASE WHEN "notify_by_email" THEN 'instant' ELSE 'off' END;