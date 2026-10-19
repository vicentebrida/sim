import { Module } from '@nestjs/common';
import { CollaboratorsModule } from '../collaborators/collaborators.module';
import { IdeasModule } from '../ideas/ideas.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JobsWorker } from './jobs.worker';

@Module({
  imports: [IdeasModule, NotificationsModule, CollaboratorsModule],
  providers: [JobsWorker],
})
export class JobsModule {}
