import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const CHANNEL = 'sim_events';

/** What the database announces (migration 0023): only what changed, never the content. */
export type RealtimeEvent =
  | { type: 'idea'; number: number }
  | { type: 'notifications'; collaboratorId: string }
  // The connection to the database was lost and is back: events may have been missed.
  | { type: 'resync' };

const MAX_RETRY_MS = 30_000;

/**
 * Listens to the database's `sim_events` channel (ADR-0009) and passes the events on to the
 * browsers connected to this process. Any process that changes the data (another replica, the
 * worker) reaches everyone, because the announcement comes from the database itself.
 */
@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeService.name);
  readonly events = new Subject<RealtimeEvent>();
  private client: Client | null = null;
  private retryMs = 1_000;
  private retryTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onApplicationBootstrap() {
    // The worker serves no browser.
    if (this.env.SIM_MODE !== 'worker') await this.connect(false);
  }

  async onApplicationShutdown() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.events.complete();
    await this.client?.end().catch(() => undefined);
  }

  private async connect(reconnecting: boolean) {
    const client = new Client({ connectionString: this.env.DATABASE_URL });
    client.on('notification', ({ payload }) => {
      if (!payload) return;
      try {
        this.events.next(JSON.parse(payload) as RealtimeEvent);
      } catch {
        this.logger.warn(`Ignored an event that is not JSON: ${payload}`);
      }
    });
    client.on('error', (error) => this.lost(client, error));
    client.on('end', () => this.lost(client, new Error('connection closed')));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
    } catch (error) {
      this.lost(client, error as Error);
      return;
    }
    this.client = client;
    this.retryMs = 1_000;
    if (reconnecting) {
      this.logger.log('Real time is back');
      this.events.next({ type: 'resync' });
    }
  }

  private lost(client: Client, error: Error) {
    if (this.stopped || (this.client !== client && this.client !== null)) return;
    this.client = null;
    client.removeAllListeners();
    // Late errors of the old connection must not crash the process.
    client.on('error', () => undefined);
    client.end().catch(() => undefined);
    if (this.retryTimer) return;
    this.logger.warn(`Real time lost the database (${error.message}); retrying`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect(true);
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }
}
