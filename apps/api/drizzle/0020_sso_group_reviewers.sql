ALTER TABLE "categories" ADD COLUMN "sso_group" text;--> statement-breakpoint
ALTER TABLE "reviewers" ADD COLUMN "via_sso" boolean DEFAULT false NOT NULL;