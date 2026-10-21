import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, count, eq, sql } from 'drizzle-orm';
import { DomainError } from '../common/domain-error';
import { DB, type Database, type Executor } from '../database/database.module';
import { isUniqueViolation } from '../database/errors';
import { executionStages } from '../database/schema';

/** Enough for a pipeline; more would be a workflow, which ADR-0004 rules out. */
export const MAX_EXECUTION_STAGES = 10;

const nameTaken = () => new DomainError('STAGE_NAME_TAKEN', 'A step with this name already exists');

@Injectable()
export class ExecutionStagesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(executor: Executor = this.db) {
    return executor
      .select({ id: executionStages.id, name: executionStages.name })
      .from(executionStages)
      .orderBy(asc(executionStages.position), asc(executionStages.createdAt));
  }

  /** Name of each step, by id. */
  async names(executor: Executor = this.db) {
    return new Map((await this.list(executor)).map(({ id, name }) => [id, name]));
  }

  async create(name: string) {
    try {
      return await this.db.transaction(async (tx) => {
        // One at a time, so the limit and the positions hold.
        await tx.execute(sql`lock table ${executionStages} in share row exclusive mode`);
        const [existing] = await tx.select({ total: count() }).from(executionStages);
        if ((existing?.total ?? 0) >= MAX_EXECUTION_STAGES) {
          throw new DomainError('TOO_MANY_STAGES', 'The limit of steps was reached');
        }
        const [stage] = await tx
          .insert(executionStages)
          .values({
            name,
            position: sql`(select coalesce(max(${executionStages.position}), 0) + 1 from ${executionStages})`,
          })
          .returning({ id: executionStages.id, name: executionStages.name });
        return stage!;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async rename(id: string, name: string) {
    try {
      const [stage] = await this.db
        .update(executionStages)
        .set({ name })
        .where(eq(executionStages.id, id))
        .returning({ id: executionStages.id, name: executionStages.name });
      if (!stage) throw new NotFoundException('Step not found');
      return stage;
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  /** Ideas in this step stay In progress, without a step; the History keeps the name. */
  async delete(id: string) {
    const [deleted] = await this.db
      .delete(executionStages)
      .where(eq(executionStages.id, id))
      .returning({ id: executionStages.id });
    if (!deleted) throw new NotFoundException('Step not found');
  }

  /** Takes every step id, in the new order. */
  async reorder(ids: string[]) {
    await this.db.transaction(async (tx) => {
      const current = await this.list(tx);
      const same =
        ids.length === current.length &&
        new Set(ids).size === ids.length &&
        current.every(({ id }) => ids.includes(id));
      if (!same) {
        throw new DomainError('STAGE_ORDER_MISMATCH', 'Send every step exactly once');
      }
      for (const [index, id] of ids.entries()) {
        await tx
          .update(executionStages)
          .set({ position: index + 1 })
          .where(eq(executionStages.id, id));
      }
    });
    return this.list();
  }
}
