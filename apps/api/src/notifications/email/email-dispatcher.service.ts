import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { DB, type Database, type Executor } from '../../database/database.module';
import { collaborators, ideas, notifications } from '../../database/schema';
import { renderDigest, renderEmail } from './email-templates';
import { anonymousName, hidesAuthor } from '../../ideas/domain/authorship';
import { BrandingService } from '../../branding/branding.service';
import { StatusesService } from '../../statuses/statuses.service';
import { Mailer } from './mailer';

export const MAX_EMAIL_ATTEMPTS = 5;
/** Wait before attempt 2, 3, 4 and 5: an SMTP outage of over an hour is survived. */
export const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];
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
    private readonly branding: BrandingService,
    private readonly statuses: StatusesService,
  ) {}

  /** Returns how many e-mails were sent. */
  async dispatchPending(): Promise<number> {
    const pending = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.emailStatus, 'pending'),
          or(isNull(notifications.emailRetryAt), lte(notifications.emailRetryAt, sql`now()`)),
        ),
      )
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
      const [row] = await this.rows(tx)
        .where(and(eq(notifications.id, id), eq(notifications.emailStatus, 'pending')))
        .for('update', { of: notifications, skipLocked: true });
      if (!row) return false; // someone else took it

      const { notification, recipient } = row;
      // The person may have been deactivated or changed the e-mail preference since it was recorded.
      if (!recipient.active || recipient.emailMode !== 'instant') {
        await tx
          .update(notifications)
          .set({
            emailStatus: recipient.active && recipient.emailMode === 'daily' ? 'digest' : 'none',
          })
          .where(eq(notifications.id, id));
        return false;
      }

      try {
        const message = renderEmail(await this.context(row));
        await this.mailer.send({ to: recipient.email, ...message });
      } catch (error) {
        const attempts = notification.emailAttempts + 1;
        const giveUp = attempts >= MAX_EMAIL_ATTEMPTS;
        this.logger.warn(
          `E-mail for notification ${id} failed (attempt ${attempts}): ${(error as Error).message}`,
        );
        await tx
          .update(notifications)
          .set({
            emailAttempts: attempts,
            emailStatus: giveUp ? 'failed' : 'pending',
            emailRetryAt: new Date(
              Date.now() + (RETRY_DELAYS_MINUTES[attempts - 1] ?? 60) * 60_000,
            ),
          })
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

  /**
   * Sends one summary e-mail to each person who chose the daily mode and has news waiting.
   * Returns how many summaries were sent.
   */
  async dispatchDigests(): Promise<number> {
    const waiting = await this.db
      .selectDistinct({ recipientId: notifications.recipientId })
      .from(notifications)
      .where(eq(notifications.emailStatus, 'digest'));
    let sent = 0;
    for (const { recipientId } of waiting) {
      if (await this.digestFor(recipientId)) sent += 1;
    }
    return sent;
  }

  private digestFor(recipientId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await this.rows(tx)
        .where(
          and(eq(notifications.recipientId, recipientId), eq(notifications.emailStatus, 'digest')),
        )
        .orderBy(asc(notifications.createdAt))
        .for('update', { of: notifications, skipLocked: true });
      if (!rows.length) return false;

      const ids = rows.map(({ notification }) => notification.id);
      const { recipient } = rows[0]!;
      if (!recipient.active || recipient.emailMode !== 'daily') {
        await tx
          .update(notifications)
          .set({
            emailStatus: recipient.active && recipient.emailMode === 'instant' ? 'pending' : 'none',
          })
          .where(inArray(notifications.id, ids));
        return false;
      }

      try {
        const items = await Promise.all(rows.map((row) => this.context(row)));
        await this.mailer.send({
          to: recipient.email,
          ...renderDigest({ ...items[0]!, items, url: this.env.SIM_PUBLIC_URL }),
        });
      } catch (error) {
        const attempts =
          Math.max(...rows.map(({ notification }) => notification.emailAttempts)) + 1;
        this.logger.warn(`Daily summary for ${recipientId} failed: ${(error as Error).message}`);
        // Tomorrow's run tries again; after too many failures the news is given up.
        await tx
          .update(notifications)
          .set({
            emailAttempts: attempts,
            emailStatus: attempts >= MAX_EMAIL_ATTEMPTS ? 'failed' : 'digest',
          })
          .where(inArray(notifications.id, ids));
        return false;
      }

      await tx
        .update(notifications)
        .set({
          emailStatus: 'sent',
          emailAttempts: sql`${notifications.emailAttempts} + 1`,
          emailSentAt: new Date(),
        })
        .where(inArray(notifications.id, ids));
      return true;
    });
  }

  // ---------- support ----------

  private rows(executor: Executor) {
    const actor = alias(collaborators, 'actor');
    return executor
      .select({
        notification: notifications,
        recipient: collaborators,
        idea: { number: ideas.number, title: ideas.title },
        authorship: {
          id: ideas.id,
          authorId: ideas.authorId,
          hiddenAuthorship: ideas.hiddenAuthorship,
        },
        actorName: actor.name,
      })
      .from(notifications)
      .innerJoin(collaborators, eq(notifications.recipientId, collaborators.id))
      .innerJoin(ideas, eq(notifications.ideaId, ideas.id))
      .leftJoin(actor, eq(notifications.actorId, actor.id))
      .$dynamic();
  }

  /** What the templates need to describe one Notification to its recipient. */
  private async context(row: Awaited<ReturnType<EmailDispatcher['rows']>>[number]) {
    const { notification, recipient } = row;
    const brand = await this.branding.get();
    return {
      locale: this.env.SIM_LOCALE,
      brand: { name: brand.name, color: brand.primaryColor },
      statusLabels: Object.fromEntries(
        (await this.statuses.list()).flatMap(({ status, label }) =>
          label ? [[status, label]] : [],
        ),
      ),
      type: notification.type,
      recipientName: recipient.name,
      actorName:
        notification.actorId && hidesAuthor(row.authorship, notification.actorId, recipient.id)
          ? anonymousName(this.env.SIM_LOCALE)
          : row.actorName,
      ideaNumber: row.idea.number,
      ideaTitle: row.idea.title,
      data: notification.data,
      url: new URL(`/ideas/${row.idea.number}`, this.env.SIM_PUBLIC_URL).toString(),
    };
  }
}
