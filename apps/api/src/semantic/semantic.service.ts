import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { EmbeddingProvider } from './embedding-provider';

const BATCH_SIZE = 20;
const MAX_TEXT_LENGTH = 8000;
/** The text an Idea is indexed by, and its hash, are computed in SQL so they cannot drift apart. */
const SOURCE_TEXT = sql`left(ideas.title || E'\\n' || ideas.detection_text, ${MAX_TEXT_LENGTH})`;
const SOURCE_HASH = sql`md5(ideas.title || ' ' || ideas.detection_text)`;

export interface SemanticMatch {
  number: number;
  /** Cosine similarity, between 0 and 1. */
  similarity: number;
}

/** Optional semantic search (PRD §3.4): vectors of the Ideas, and the Ideas closest to a text. */
@Injectable()
export class SemanticService {
  private readonly logger = new Logger(SemanticService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly provider: EmbeddingProvider,
  ) {}

  get enabled() {
    return Boolean(this.env.SIM_EMBEDDINGS_URL && this.env.SIM_EMBEDDINGS_MODEL);
  }

  private get model() {
    return this.env.SIM_EMBEDDINGS_MODEL!;
  }

  /** Published Ideas without a vector, or with one that is stale (other model, edited text). */
  private pendingFor(model: string) {
    return sql`
      ideas.status not in ('draft', 'duplicate')
      and not exists (
        select 1 from idea_embeddings e
        where e.idea_id = ideas.id and e.model = ${model} and e.text_hash = ${SOURCE_HASH}
      )`;
  }

  /** Indexes a batch of pending Ideas. Returns how many were indexed. */
  async indexPending(limit = BATCH_SIZE): Promise<number> {
    if (!this.enabled) return 0;
    const pending = await this.db.execute<{ id: string; text: string; hash: string }>(sql`
      select ideas.id, ${SOURCE_TEXT} as text, ${SOURCE_HASH} as hash
      from ideas where ${this.pendingFor(this.model)}
      order by ideas.number limit ${limit}`);
    if (!pending.rows.length) return 0;

    const vectors = await this.provider.embed(pending.rows.map((row) => row.text));
    for (const [index, row] of pending.rows.entries()) {
      const vector = `[${vectors[index]!.join(',')}]`;
      await this.db.execute(sql`
        insert into idea_embeddings (idea_id, model, text_hash, embedding)
        values (${row.id}, ${this.model}, ${row.hash}, ${vector}::vector)
        on conflict (idea_id) do update set
          model = excluded.model, text_hash = excluded.text_hash,
          embedding = excluded.embedding, created_at = now()`);
    }
    return pending.rows.length;
  }

  /** Published Ideas closest in meaning to the text, above the configured threshold. */
  async search(
    text: string,
    options: { exclude?: number; limit: number },
  ): Promise<SemanticMatch[]> {
    if (!this.enabled) return [];
    const [vector] = await this.provider.embed([text.slice(0, MAX_TEXT_LENGTH)]);
    const literal = `[${vector!.join(',')}]`;
    const result = await this.db.execute<{ number: number; similarity: number }>(sql`
      select ideas.number, 1 - (e.embedding <=> ${literal}::vector) as similarity
      from idea_embeddings e
      join ideas on ideas.id = e.idea_id
      where e.model = ${this.model}
        and ideas.status not in ('draft', 'duplicate')
        ${options.exclude ? sql`and ideas.number <> ${options.exclude}` : sql``}
        and 1 - (e.embedding <=> ${literal}::vector) >= ${this.env.SIM_SEMANTIC_THRESHOLD}
      order by e.embedding <=> ${literal}::vector
      limit ${options.limit}`);
    return result.rows.map((row) => ({ number: row.number, similarity: Number(row.similarity) }));
  }

  /** For the Administrator: how much of the collection is indexed. */
  async coverage() {
    const result = await this.db.execute<{ total: number; pending: number }>(sql`
      select count(*)::int as total,
        (count(*) filter (where ${this.pendingFor(this.model)}))::int as pending
      from ideas where ideas.status not in ('draft', 'duplicate')`);
    const row = result.rows[0]!;
    return { total: row.total, indexed: row.total - row.pending, pending: row.pending };
  }

  /** Asks the service for one vector, to tell the Administrator whether it is reachable. */
  async test(): Promise<{ ok: true; dimensions: number } | { ok: false; error: string }> {
    try {
      const [vector] = await this.provider.embed(['SIM']);
      return { ok: true, dimensions: vector!.length };
    } catch (error) {
      this.logger.warn(`Embeddings test failed: ${(error as Error).message}`);
      return { ok: false, error: (error as Error).message };
    }
  }
}
