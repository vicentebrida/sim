-- Semantic search (optional) needs the pgvector extension; the compose Postgres image has it.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "idea_embeddings" (
	"idea_id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_embeddings" ADD CONSTRAINT "idea_embeddings_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;