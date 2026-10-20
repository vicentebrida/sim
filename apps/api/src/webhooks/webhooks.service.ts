import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database, type Executor } from '../database/database.module';
import {
  categories,
  collaborators,
  ideas,
  type WebhookChannel,
  webhookDeliveries,
  type WebhookEvent,
} from '../database/schema';
import { presentPerson } from '../ideas/domain/authorship';
import { statusName } from '../notifications/email/email-templates';
import { StatusesService } from '../statuses/statuses.service';
import { linkLabel, publishedText, statusText, webhookBody } from './webhook-messages';

export const MAX_WEBHOOK_ATTEMPTS = 5;
/** Wait before attempt 2, 3, 4 and 5, as for e-mails. */
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];
const BATCH_SIZE = 50;
const TIMEOUT_MS = 10_000;

/**
 * Tells chat channels (Slack, Teams, Google Chat) about new Ideas and Status changes. The
 * channels come from environment variables (ADR-0007); messages carry the title and the link,
 * never the text of the Idea, since a channel may have people from outside the SIM.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly statuses: StatusesService,
  ) {}

  /** The configured channels and their URLs (the URLs are secrets: never show them). */
  get channels(): { channel: WebhookChannel; url: string }[] {
    const urls: [WebhookChannel, string | undefined][] = [
      ['slack', this.env.SIM_WEBHOOK_SLACK_URL],
      ['teams', this.env.SIM_WEBHOOK_TEAMS_URL],
      ['google_chat', this.env.SIM_WEBHOOK_GOOGLE_CHAT_URL],
    ];
    return urls.flatMap(([channel, url]) => (url ? [{ channel, url }] : []));
  }

  get events(): WebhookEvent[] {
    return this.env.SIM_WEBHOOK_EVENTS;
  }

  /** Records one delivery per channel, in the transaction of the event. */
  async record(
    tx: Executor,
    event: WebhookEvent,
    ideaId: string,
    actorId: string,
    data: Record<string, unknown> = {},
  ) {
    if (!this.events.includes(event) || !this.channels.length) return;
    await tx
      .insert(webhookDeliveries)
      .values(this.channels.map(({ channel }) => ({ channel, event, ideaId, actorId, data })));
  }

  /** Sends the pending deliveries; returns how many were sent. */
  async dispatchPending(now = new Date()): Promise<number> {
    const due = await this.db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, 'pending'),
          or(isNull(webhookDeliveries.retryAt), lte(webhookDeliveries.retryAt, now)),
        ),
      )
      .orderBy(asc(webhookDeliveries.createdAt))
      .limit(BATCH_SIZE);
    let sent = 0;
    for (const { id } of due) if (await this.dispatchOne(id)) sent += 1;
    return sent;
  }

  private dispatchOne(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          delivery: webhookDeliveries,
          idea: ideas,
          category: categories.name,
          author: { id: collaborators.id, name: collaborators.name },
        })
        .from(webhookDeliveries)
        .innerJoin(ideas, eq(webhookDeliveries.ideaId, ideas.id))
        .innerJoin(categories, eq(ideas.categoryId, categories.id))
        .innerJoin(collaborators, eq(ideas.authorId, collaborators.id))
        .where(and(eq(webhookDeliveries.id, id), eq(webhookDeliveries.status, 'pending')))
        .for('update', { of: webhookDeliveries, skipLocked: true });
      if (!row) return false; // someone else took it

      const { delivery, idea } = row;
      const target = this.channels.find(({ channel }) => channel === delivery.channel);
      try {
        // The channel may have been removed from the configuration since it was recorded.
        if (!target) throw new Error(`${delivery.channel} is no longer configured`);
        const text = await this.text(delivery.event, delivery.data, {
          ...row,
          author: presentPerson(idea, row.author, '', this.env.SIM_LOCALE).name,
        });
        await this.post(target.url, delivery.channel, text, idea.number);
      } catch (error) {
        const attempts = delivery.attempts + 1;
        this.logger.warn(
          `Webhook ${delivery.channel} for Idea #${idea.number} failed (attempt ${attempts}): ${(error as Error).message}`,
        );
        await tx
          .update(webhookDeliveries)
          .set({
            attempts,
            status: !target || attempts >= MAX_WEBHOOK_ATTEMPTS ? 'failed' : 'pending',
            retryAt: new Date(Date.now() + (RETRY_DELAYS_MINUTES[attempts - 1] ?? 60) * 60_000),
          })
          .where(eq(webhookDeliveries.id, id));
        return false;
      }
      await tx
        .update(webhookDeliveries)
        .set({ status: 'sent', attempts: delivery.attempts + 1, sentAt: new Date() })
        .where(eq(webhookDeliveries.id, id));
      return true;
    });
  }

  private async text(
    event: WebhookEvent,
    data: Record<string, unknown>,
    row: { idea: { number: number; title: string }; category: string; author: string },
  ) {
    const locale = this.env.SIM_LOCALE;
    if (event === 'published') {
      return publishedText(locale, { ...row.idea, category: row.category, author: row.author });
    }
    const labels = Object.fromEntries(
      (await this.statuses.list()).flatMap(({ status, label }) => (label ? [[status, label]] : [])),
    );
    return statusText(
      locale,
      row.idea,
      statusName(locale, data.from, labels),
      statusName(locale, data.to, labels),
    );
  }

  private async post(url: string, channel: WebhookChannel, text: string, ideaNumber?: number) {
    const link = new URL(
      ideaNumber ? `/ideas/${ideaNumber}` : '/',
      this.env.SIM_PUBLIC_URL,
    ).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        webhookBody(channel, { text, url: link, linkLabel: linkLabel(this.env.SIM_LOCALE) }),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  /** Sends a test message to each channel, right away, and says how each one went. */
  async test() {
    const text =
      this.env.SIM_LOCALE === 'en'
        ? 'Test message from the SIM: this channel will be told about new Ideas.'
        : 'Mensagem de teste do SIM: este canal vai receber as novidades das Ideias.';
    return Promise.all(
      this.channels.map(async ({ channel, url }) => {
        try {
          await this.post(url, channel, text);
          return { channel, ok: true, error: null };
        } catch (error) {
          return { channel, ok: false, error: (error as Error).message };
        }
      }),
    );
  }
}
