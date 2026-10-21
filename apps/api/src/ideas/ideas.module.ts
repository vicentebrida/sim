import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';
import { AutoArchiveService } from './auto-archive.service';
import { StalledIdeasService } from './stalled-ideas.service';

@Module({
  imports: [CustomFieldsModule, NotificationsModule],
  controllers: [IdeasController],
  providers: [IdeasService, StalledIdeasService, AutoArchiveService],
  exports: [IdeasService, StalledIdeasService, AutoArchiveService],
})
export class IdeasModule {}
