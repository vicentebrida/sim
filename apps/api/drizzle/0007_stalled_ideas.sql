ALTER TABLE "notifications" DROP CONSTRAINT "notifications_valid_type";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "stalled_open_days" integer;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "stalled_review_days" integer;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "stalled_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "stalled_escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_valid_stalled_days" CHECK (("categories"."stalled_open_days" is null or "categories"."stalled_open_days" > 0) and ("categories"."stalled_review_days" is null or "categories"."stalled_review_days" > 0));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_valid_type" CHECK ("notifications"."type" in ('status','duplicate','comment','reply','mention','new_idea','stalled','stalled_escalated'));