import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { CollaboratorsService } from '../collaborators/collaborators.service';
import { SemanticService } from '../semantic/semantic.service';
import { StalledIdeasService } from '../ideas/stalled-ideas.service';
import { EmailDispatcher } from '../notifications/email/email-dispatcher.service';

const QUEUE = 'sim-jobs';
const EMAILS = 'dispatch-emails';
const STALLED = 'check-stalled-ideas';
const EMBEDDINGS = 'embed-ideas';
const INACTIVITY = 'deactivate-inactive-collaborators';

/**
 * Background jobs through BullMQ (ADR-0006): sending e-mail every 15 s and looking for Stalled
 * Ideas every hour. Each job only calls a service that works from the database, so a job that
 * runs twice or late does no harm. Started where jobs are processed (`worker` or `all` mode).
 */
@Injectable()
export class JobsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsWorker.name);
  private connections: IORedis[] = [];
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly dispatcher: EmailDispatcher,
    private readonly stalled: StalledIdeasService,
    private readonly collaborators: CollaboratorsService,
    private readonly semantic: SemanticService,
  ) {}

  async onApplicationBootstrap() {
    const { REDIS_URL, SMTP_URL, SIM_MODE } = this.env;
    if (SIM_MODE === 'api' || !REDIS_URL) return;
    const connect = () => {
      const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
      // Redis being down must not take the SIM down (ADR-0006).
      connection.on('error', (error) => this.logger.warn(`Redis: ${error.message}`));
      this.connections.push(connection);
      return connection;
    };
    this.queue = new Queue(QUEUE, { connection: connect() });
    this.queue.on('error', (error) => this.logger.warn(`Queue: ${error.message}`));
    if (SMTP_URL) await this.queue.upsertJobScheduler(EMAILS, { every: 15_000 }, { name: EMAILS });
    await this.queue.upsertJobScheduler(STALLED, { every: 3_600_000 }, { name: STALLED });
    if (this.semantic.enabled) {
      await this.queue.upsertJobScheduler(EMBEDDINGS, { every: 30_000 }, { name: EMBEDDINGS });
    }
    if (this.env.SIM_INACTIVITY_DAYS) {
      await this.queue.upsertJobScheduler(
        INACTIVITY,
        { every: 6 * 3_600_000 },
        { name: INACTIVITY },
      );
    }
    this.worker = new Worker(QUEUE, (job) => this.run(job), { connection: connect() });
    this.worker.on('error', (error) => this.logger.warn(`Worker: ${error.message}`));
    this.logger.log('Background jobs scheduled');
  }

  private async run(job: Job) {
    if (job.name === EMAILS) return this.dispatcher.dispatchPending();
    if (job.name === STALLED) return this.stalled.check();
    if (job.name === EMBEDDINGS) return this.semantic.indexPending();
    if (job.name === INACTIVITY && this.env.SIM_INACTIVITY_DAYS) {
      return this.collaborators.deactivateInactive(this.env.SIM_INACTIVITY_DAYS);
    }
    this.logger.warn(`Unknown job ${job.name}`);
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    for (const connection of this.connections) connection.disconnect();
  }
}
