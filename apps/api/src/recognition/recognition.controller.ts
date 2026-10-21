import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentCollaborator } from '../auth/decorators';
import type { Collaborator } from '../database/schema';
import { ProfileDto, RecentlyCompletedDto } from './recognition.dto';
import { RecognitionService } from './recognition.service';

@ApiTags('recognition')
@Controller()
export class RecognitionController {
  constructor(private readonly recognition: RecognitionService) {}

  /** Public to everyone signed in, by decision: recognition is meant to be seen. */
  @Get('people/:id')
  @ZodResponse({ status: 200, type: ProfileDto })
  profile(@CurrentCollaborator() viewer: Collaborator, @Param('id', ParseUUIDPipe) id: string) {
    return this.recognition.profile(viewer, id);
  }

  @Get('recognition/recently-completed')
  @ZodResponse({ status: 200, type: RecentlyCompletedDto })
  recentlyCompleted(@CurrentCollaborator() viewer: Collaborator) {
    return this.recognition.recentlyCompleted(viewer);
  }
}
