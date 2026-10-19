CREATE TABLE "status_settings" (
	"status" text PRIMARY KEY NOT NULL,
	"label" text,
	"color" text,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
