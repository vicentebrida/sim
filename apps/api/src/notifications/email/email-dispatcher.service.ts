import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { DB, type Database } from '../../database/database.module';
import { collaborators, ideas, notifications } from '../../database/schema';
import { renderEmail } from './email-templates';
import { Mailer } from './mailer';

export const MAX_EMAIL_ATTEMPTS = 5;
const BATCH_SIZE = 50;

/**
 * Sends the e-mail copy of Notifications recorded as `pending`. The database is the source of
 * truth (ADR-0006): the job only calls this, and a row is claimed with a lock, so running it twice
 * (or from two workers) never sends the same e-mail twice.
 */
@Injectable()
export class EmailDispatcher {
  private readonly logger = new Logger(EmailDispatcher.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly mailer: Mailer,
  ) {}

  /** Returns how many e-mails were sent. */
  async dispatchPending(): Promise<number> {
    const pending = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.emailStatus, 'pending'))
      .orderBy(asc(notifications.createdAt))
      .limit(BATCH_SIZE);
    let sent = 0;
    for (const { id } of pending) {
      if (await this.dispatchOne(id)) sent += 1;
    }
    return sent;
  }

  private async dispatchOne(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const actor = alias(collaborators, 'actor');
      const [row] = await tx
        .select({
          notification: notifications,
          recipient: collaborators,
          idea: { number: ideas.number, title: ideas.title },
          actorName: actor.name,
        })
        .from(notifications)
        .innerJoin(collaborators, eq(notifications.recipientId, collaborators.id))
        .innerJoin(ideas, eq(notifications.ideaId, ideas.id))
        .leftJoin(actor, eq(notifications.actorId, actor.id))
        .where(and(eq(notifications.id, id), eq(notifications.emailStatus, 'pending')))
        .for('update', { of: notifications, skipLocked: true });
      if (!row) return false; // someone else took it

      const { notification, recipient } = row;
      // The person may have been deactivated or turned e-mail off since it was recorded.
      if (!recipient.active || !recipient.notifyByEmail) {
        await tx.update(notifications).set({ emailStatus: 'none' }).where(eq(notifications.id, id));
        return false;
      }

      try {
        const message = renderEmail({
          locale: this.env.SIM_LOCALE,
          type: notification.type,
          recipientName: recipient.name,
          actorName: row.actorName,
          ideaNumber: row.idea.number,
          ideaTitle: row.idea.title,
          data: notification.data,
          url: new URL(`/ideas/${row.idea.number}`, this.env.SIM_PUBLIC_URL).toString(),
        });
        await this.mailer.send({ to: recipient.email, ...message });
      } catch (error) {
        const attempts = notification.emailAttempts + 1;
        const giveUp = attempts >= MAX_EMAIL_ATTEMPTS;
        this.logger.warn(
          `E-mail for notification ${id} failed (attempt ${attempts}): ${(error as Error).message}`,
        );
        await tx
          .update(notifications)
          .set({ emailAttempts: attempts, emailStatus: giveUp ? 'failed' : 'pending' })
          .where(eq(notifications.id, id));
        return false;
      }

      await tx
        .update(notifications)
        .set({
          emailStatus: 'sent',
          emailAttempts: sql`${notifications.emailAttempts} + 1`,
          emailSentAt: new Date(),
        })
        .where(eq(notifications.id, id));
      return true;
    });
  }
}
