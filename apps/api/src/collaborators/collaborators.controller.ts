import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly, CurrentCollaborator } from '../auth/decorators';
import type { Collaborator } from '../database/schema';
import {
  CollaboratorActivationDto,
  ManagedCollaboratorDto,
  LocalAccountCreatedDto,
  MentionableDto,
  MentionableSearchDto,
  NewLocalAccountDto,
} from './collaborators.dto';
import { CollaboratorsService } from './collaborators.service';

const managed = (collaborator: Collaborator) => ({
  ...collaborator,
  anonymized: collaborator.anonymizedAt !== null,
});

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
  @ZodResponse({ status: 200, type: [ManagedCollaboratorDto] })
  async list() {
    return (await this.collaborators.list()).map(managed);
  }

  @Post()
  @ZodResponse({ status: 201, type: LocalAccountCreatedDto })
  async createLocalAccount(@Body() data: NewLocalAccountDto) {
    const { collaborator, temporaryPassword } = await this.collaborators.createLocalAccount(data);
    return { collaborator: managed(collaborator), temporaryPassword };
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: ManagedCollaboratorDto })
  async setActive(
    @CurrentCollaborator() actor: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CollaboratorActivationDto,
  ) {
    return managed(await this.collaborators.setActive(actor, id, data.active));
  }

  /** Irreversible: erases name, e-mail, photo and SSO data. The content stays. */
  @Post(':id/anonymize')
  @ZodResponse({ status: 200, type: ManagedCollaboratorDto })
  async anonymize(
    @CurrentCollaborator() actor: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return managed(await this.collaborators.anonymize(actor, id));
  }
}
