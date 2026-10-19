CREATE TABLE "installation_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"hidden_authorship_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "installation_settings_single_row" CHECK ("installation_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "hidden_authorship" boolean DEFAULT false NOT NULL;