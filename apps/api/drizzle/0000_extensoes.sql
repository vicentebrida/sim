-- Busca textual de Ideias Semelhantes (ADR-0002): trigramas e remoção de acentos.
-- A extensão `vector` é habilitada no Marco 2, junto com a busca semântica opcional.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
