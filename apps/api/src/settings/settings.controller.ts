import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { AdministratorOnly, CurrentCollaborator } from '../auth/decorators';
import type { Collaborator } from '../database/schema';
import { SettingsService } from './settings.service';

class SettingsDto extends createZodDto(z.object({ hiddenAuthorshipEnabled: z.boolean() })) {}
class SettingsUpdateDto extends createZodDto(
  z.object({ hiddenAuthorshipEnabled: z.boolean().optional() }),
) {}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Open to every signed-in person: the Idea form needs to know whether authorship can be hidden. */
  @Get()
  @ZodResponse({ status: 200, type: SettingsDto })
  get() {
    return this.settings.get();
  }

  @Patch()
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: SettingsDto })
  update(@CurrentCollaborator() actor: Collaborator, @Body() data: SettingsUpdateDto) {
    return this.settings.update(actor, data);
  }
}
