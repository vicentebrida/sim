CREATE TABLE "execution_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_valid_type";--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "execution_stage_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_stages_name_unique" ON "execution_stages" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_execution_stage_id_execution_stages_id_fk" FOREIGN KEY ("execution_stage_id") REFERENCES "public"."execution_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_valid_type" CHECK ("notifications"."type" in ('status','duplicate','comment','reply','mention','new_idea','stalled','stalled_escalated','archive_warning','stage'));--> statement-breakpoint
-- Real time (ADR-0009): a step change is announced like the other changes of the Idea.
DROP TRIGGER "ideas_realtime" ON "ideas";--> statement-breakpoint
CREATE TRIGGER "ideas_realtime" AFTER UPDATE OF "title", "values", "status", "category_id", "hidden_authorship", "original_idea_id", "published_at", "edited_at", "execution_stage_id" OR DELETE ON "ideas"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_idea_changed"();
