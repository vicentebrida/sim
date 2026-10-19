CREATE TABLE "collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"sso_subject" text,
	"department" text,
	"picture_url" text,
	"administrator" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "collaborators_email_unique" UNIQUE("email"),
	CONSTRAINT "collaborators_ssoSubject_unique" UNIQUE("sso_subject")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"collaborator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviewers" (
	"category_id" uuid NOT NULL,
	"collaborator_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewers_category_id_collaborator_id_pk" PRIMARY KEY("category_id","collaborator_id")
);
--> statement-breakpoint
CREATE TABLE "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"help" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"use_for_detection" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_value" text,
	"to_value" text NOT NULL,
	"justification" text,
	"collaborator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "ideas_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"category_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"status" text NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"original_idea_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideas_number_unique" UNIQUE("number"),
	CONSTRAINT "ideas_valid_status" CHECK ("ideas"."status" in ('draft','open','under_review','approved','in_progress','done','declined','duplicate','archived')),
	CONSTRAINT "ideas_duplicate_has_original" CHECK (("ideas"."status" = 'duplicate') = ("ideas"."original_idea_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"idea_id" uuid NOT NULL,
	"collaborator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_idea_id_collaborator_id_pk" PRIMARY KEY("idea_id","collaborator_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"reply_to_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"hidden_by_id" uuid,
	"hidden_reason" text,
	CONSTRAINT "comments_hiding_complete" CHECK (("comments"."hidden_at" is null) = ("comments"."hidden_by_id" is null) and ("comments"."hidden_at" is null) = ("comments"."hidden_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"comment_id" uuid NOT NULL,
	"collaborator_id" uuid NOT NULL,
	CONSTRAINT "mentions_comment_id_collaborator_id_pk" PRIMARY KEY("comment_id","collaborator_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewers" ADD CONSTRAINT "reviewers_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewers" ADD CONSTRAINT "reviewers_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_history" ADD CONSTRAINT "idea_history_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_history" ADD CONSTRAINT "idea_history_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_author_id_collaborators_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_original_idea_id_ideas_id_fk" FOREIGN KEY ("original_idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_collaborators_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_id_comments_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_hidden_by_id_collaborators_id_fk" FOREIGN KEY ("hidden_by_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_collaborator_id_collaborators_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."collaborators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_collaborator_id_index" ON "sessions" USING btree ("collaborator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_unique" ON "categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "reviewers_collaborator_id_index" ON "reviewers" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "idea_history_idea_id_created_at_index" ON "idea_history" USING btree ("idea_id","created_at");--> statement-breakpoint
CREATE INDEX "ideas_status_index" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ideas_category_id_index" ON "ideas" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "ideas_author_id_index" ON "ideas" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "ideas_published_at_index" ON "ideas" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "likes_collaborator_id_index" ON "likes" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "comments_idea_id_created_at_index" ON "comments" USING btree ("idea_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_reply_to_id_index" ON "comments" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "mentions_collaborator_id_index" ON "mentions" USING btree ("collaborator_id");