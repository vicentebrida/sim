import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { EmailDispatcher } from './email-dispatcher.service';

const QUEUE = 'sim-email';
const SCHEDULER = 'dispatch-emails';
const EVERY_MS = 15_000;

/**
 * Runs the dispatcher on a schedule through BullMQ (ADR-0006). Only started where jobs are
 * processed (`worker` or `all` mode) and when Redis and SMTP are configured.
 */
@Injectable()
export class EmailWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EmailWorker.name);
  private connections: IORedis[] = [];
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly dispatcher: EmailDispatcher,
  ) {}

  async onApplicationBootstrap() {
    const { REDIS_URL, SMTP_URL, SIM_MODE } = this.env;
    if (SIM_MODE === 'api' || !REDIS_URL || !SMTP_URL) {
      if (SIM_MODE !== 'api' && !SMTP_URL) this.logger.log('SMTP_URL not set: no e-mails');
      return;
    }
    const connect = () => {
      const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
      // Redis being down must not take the SIM down (ADR-0006).
      connection.on('error', (error) => this.logger.warn(`Redis: ${error.message}`));
      this.connections.push(connection);
      return connection;
    };
    this.queue = new Queue(QUEUE, { connection: connect() });
    this.queue.on('error', (error) => this.logger.warn(`Queue: ${error.message}`));
    await this.queue.upsertJobScheduler(SCHEDULER, { every: EVERY_MS });
    this.worker = new Worker(QUEUE, async () => this.dispatcher.dispatchPending(), {
      connection: connect(),
    });
    this.worker.on('error', (error) => this.logger.warn(`Worker: ${error.message}`));
    this.logger.log('E-mail dispatcher scheduled');
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    for (const connection of this.connections) connection.disconnect();
  }
}
