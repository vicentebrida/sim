ALTER TABLE "ideas" ADD COLUMN "detection_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('portuguese', immutable_unaccent("ideas"."title")), 'A') || setweight(to_tsvector('portuguese', immutable_unaccent("ideas"."detection_text")), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "ideas_search_vector_index" ON "ideas" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "ideas_title_trigram_index" ON "ideas" USING gin (immutable_unaccent(lower("title")) gin_trgm_ops);