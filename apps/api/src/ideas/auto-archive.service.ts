import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { ideaHistory, ideas } from '../database/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  ARCHIVE_WARNING_DAYS,
  archiveDate,
  autoArchiveStage,
  lastActivitySql,
} from './domain/auto-archive';

const JUSTIFICATION = {
  'pt-BR': (days: number) =>
    `Arquivada automaticamente: sem Curtidas, Comentários nem edições há ${days} dias.`,
  en: (days: number) => `Archived automatically: no Likes, Comments or edits for ${days} days.`,
};

/**
 * Automatic archiving (off unless the Administrator sets the days): an Open Idea nobody liked,
 * commented or edited for that long is archived by the SIM, after warning its Author. Safe to run
 * any number of times: the warning is stored on the Idea.
 */
@Injectable()
export class AutoArchiveService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Returns how many Ideas were warned or archived. */
  async check(now = new Date()): Promise<number> {
    const days = (await this.settings.get()).autoArchive.days;
    if (!days) return 0;
    const candidates = await this.db
      .select({ id: ideas.id })
      .from(ideas)
      .where(
        and(
          eq(ideas.status, 'open'),
          sql`${lastActivitySql} < ${now.toISOString()}::timestamptz - make_interval(days => ${days - ARCHIVE_WARNING_DAYS})`,
        ),
      );
    let handled = 0;
    for (const { id } of candidates) {
      if (await this.handle(id, now, days)) handled += 1;
    }
    return handled;
  }

  private handle(id: string, now: Date, days: number) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ idea: ideas, lastActivity: lastActivitySql })
        .from(ideas)
        .where(and(eq(ideas.id, id), eq(ideas.status, 'open')))
        .for('update', { skipLocked: true });
      if (!row) return false;
      const idea = row.idea;
      const stage = autoArchiveStage(
        { lastActivity: new Date(row.lastActivity), archiveWarnedAt: idea.archiveWarnedAt },
        now,
        days,
      );
      if (stage === 'none') return false;

      if (stage === 'warn') {
        await this.notifications.onArchiveWarning(tx, idea, archiveDate(now));
        await tx.update(ideas).set({ archiveWarnedAt: now }).where(eq(ideas.id, id));
        return true;
      }

      await tx
        .update(ideas)
        .set({ status: 'archived', statusChangedAt: now })
        .where(eq(ideas.id, id));
      await tx.insert(ideaHistory).values({
        ideaId: id,
        type: 'status',
        fromValue: 'open',
        toValue: 'archived',
        justification: JUSTIFICATION[this.env.SIM_LOCALE](days),
        collaboratorId: null,
        createdAt: now,
      });
      await this.notifications.onStatusChanged(tx, idea, { from: 'open', to: 'archived' }, null);
      await this.webhooks.record(tx, 'status', id, null, { from: 'open', to: 'archived' });
      return true;
    });
  }
}
