import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { AdministratorOnly } from '../auth/decorators';
import { STATUSES } from '../ideas/domain/idea';
import { StatusSettingDto, StatusSettingUpdateDto } from './statuses.dto';
import { StatusesService } from './statuses.service';

@ApiTags('statuses')
@Controller('statuses')
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  @Get()
  @ZodResponse({ status: 200, type: [StatusSettingDto] })
  list() {
    return this.statuses.list();
  }

  @Put(':status')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: StatusSettingDto })
  update(@Param('status') status: string, @Body() data: StatusSettingUpdateDto) {
    const parsed = z.enum(STATUSES).safeParse(status);
    if (!parsed.success) throw new BadRequestException('Unknown Status');
    return this.statuses.update(parsed.data, data);
  }
}
