ALTER TABLE "collaborators" ADD COLUMN "notify_by_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notifications_email_pending_index" ON "notifications" USING btree ("created_at") WHERE "notifications"."email_status" = 'pending';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_valid_email_status" CHECK ("notifications"."email_status" in ('none','pending','sent','failed'));