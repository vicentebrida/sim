-- Text search for Similar Ideas (ADR-0002): trigrams and accent removal.
-- The `vector` extension is enabled in Milestone 2, with the optional semantic search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
