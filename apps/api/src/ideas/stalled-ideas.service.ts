import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { categories, ideas } from '../database/schema';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isStalledSql, stalledStage } from './domain/stalled';

/**
 * Finds Stalled Ideas and notifies: Reviewers first, Administrators after the escalation time.
 * Safe to run any number of times: what was already notified is stored on the Idea.
 */
@Injectable()
export class StalledIdeasService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /** Days without Reviewer action, as set by the Administrator (or the environment default). */
  async deadlines() {
    const { openDays, reviewDays } = (await this.settings.get()).stalled;
    return { openDays, reviewDays };
  }

  /** Returns how many Ideas were notified. */
  async check(now = new Date()): Promise<number> {
    const stalled = await this.db
      .select({ id: ideas.id })
      .from(ideas)
      .innerJoin(categories, eq(ideas.categoryId, categories.id))
      .where(isStalledSql(await this.deadlines()));
    let notified = 0;
    for (const { id } of stalled) {
      if (await this.handle(id, now)) notified += 1;
    }
    return notified;
  }

  private async handle(id: string, now: Date) {
    const deadlines = await this.deadlines();
    const escalationDays = (await this.settings.get()).stalled.escalationDays;
    return this.db.transaction(async (tx) => {
      const [idea] = await tx
        .select()
        .from(ideas)
        .innerJoin(categories, eq(ideas.categoryId, categories.id))
        .where(and(eq(ideas.id, id), isStalledSql(deadlines)))
        .for('update', { of: ideas, skipLocked: true });
      if (!idea) return false;
      const stage = stalledStage(idea.ideas, now, escalationDays);
      if (stage === 'none') return false;

      await this.notifications.onStalled(tx, idea.ideas, stage);
      await tx
        .update(ideas)
        .set(stage === 'escalate' ? { stalledEscalatedAt: now } : { stalledNotifiedAt: now })
        .where(eq(ideas.id, id));
      return true;
    });
  }
}
