import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Database, type Executor } from '../database/database.module';
import { auditLog, collaborators } from '../database/schema';

export interface AuditRecord {
  /** Null for the system. */
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Takes the caller's transaction: the action and its record stand or fall together. */
  async record(executor: Executor, entry: AuditRecord) {
    await executor.insert(auditLog).values({ ...entry, details: entry.details ?? {} });
  }

  async list(filter: { page: number; pageSize: number }) {
    const actor = alias(collaborators, 'actor');
    const [rows, [counted]] = await Promise.all([
      this.db
        .select({ entry: auditLog, actor: { id: actor.id, name: actor.name } })
        .from(auditLog)
        .leftJoin(actor, eq(auditLog.actorId, actor.id))
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(auditLog),
    ]);
    return {
      items: rows.map(({ entry, actor: who }) => ({
        id: entry.id,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details,
        actor: who,
        createdAt: entry.createdAt.toISOString(),
      })),
      total: counted?.total ?? 0,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}
