import { Module } from '@nestjs/common';
import { IdeasModule } from '../ideas/ideas.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsWorker } from './jobs.worker';

@Module({ imports: [IdeasModule, NotificationsModule], providers: [JobsWorker] })
export class JobsModule {}
