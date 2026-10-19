import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly } from '../auth/decorators';
import {
  CollaboratorDto,
  LocalAccountCreatedDto,
  MentionableDto,
  MentionableSearchDto,
  NewLocalAccountDto,
} from './collaborators.dto';
import { CollaboratorsService } from './collaborators.service';

/** Open to every Collaborator: only name and id, to suggest Mentions in Comments. */
@ApiTags('collaborators')
@Controller('collaborators/mentionable')
export class MentionableController {
  constructor(private readonly collaborators: CollaboratorsService) {}

  @Get()
  @ZodResponse({ status: 200, type: [MentionableDto] })
  search(@Query() { search }: MentionableSearchDto) {
    return this.collaborators.mentionable(search);
  }
}

@ApiTags('collaborators')
@Controller('collaborators')
@AdministratorOnly()
export class CollaboratorsController {
  constructor(private readonly collaborators: CollaboratorsService) {}

  @Get()
  @ZodResponse({ status: 200, type: [CollaboratorDto] })
  list() {
    return this.collaborators.list();
  }

  @Post()
  @ZodResponse({ status: 201, type: LocalAccountCreatedDto })
  createLocalAccount(@Body() data: NewLocalAccountDto) {
    return this.collaborators.createLocalAccount(data);
  }
}
