CREATE TABLE "followers" (
	"idea_id" uuid NOT NULL,
	"collaborator_id" uuid NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "followers_idea_id_collaborator_id_pk" PRIMARY KEY("idea_id","collaborator_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" text NOT NULL,
	"idea_id" uuid NOT NULL,
	"comment_id" uuid,
	"actor_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_valid_type" CHECK ("notifications"."type" in ('status','duplicate','comment','reply','mention','new_idea'))
);
--> statement-breakpoint
ALTER TABLE "collaborators" ADD COLUMN "notify_new_comments" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_collaborators_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_collaborators_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "followers_collaborator_id_index" ON "followers" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_created_at_index" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_index" ON "notifications" USING btree ("recipient_id") WHERE "notifications"."read_at" is null;