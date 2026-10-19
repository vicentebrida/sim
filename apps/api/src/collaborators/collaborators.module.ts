import { Module } from '@nestjs/common';
import { CollaboratorsController, MentionableController } from './collaborators.controller';
import { CollaboratorsService } from './collaborators.service';
import { EmergencyAccountService } from './emergency-account.service';

@Module({
  controllers: [MentionableController, CollaboratorsController],
  providers: [CollaboratorsService, EmergencyAccountService],
  exports: [CollaboratorsService, EmergencyAccountService],
})
export class CollaboratorsModule {}
