CREATE TABLE "branding" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'SIM' NOT NULL,
	"primary_color" text,
	"login_title" text DEFAULT '' NOT NULL,
	"login_text" text DEFAULT '' NOT NULL,
	"logo_light" jsonb,
	"logo_dark" jsonb,
	"favicon" jsonb,
	"login_image" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branding_single_row" CHECK ("branding"."id" = 1)
);
