CREATE TABLE "idea_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"category_id" uuid NOT NULL,
	"values" jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_versions_ideaId_version_unique" UNIQUE("idea_id","version")
);
--> statement-breakpoint
ALTER TABLE "idea_versions" ADD CONSTRAINT "idea_versions_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_versions" ADD CONSTRAINT "idea_versions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;