import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly } from '../auth/decorators';
import {
  ExecutionStageDataDto,
  ExecutionStageDto,
  ExecutionStageOrderDto,
} from './execution-stages.dto';
import { ExecutionStagesService } from './execution-stages.service';

@ApiTags('execution-stages')
@Controller('execution-stages')
export class ExecutionStagesController {
  constructor(private readonly stages: ExecutionStagesService) {}

  @Get()
  @ZodResponse({ status: 200, type: [ExecutionStageDto] })
  list() {
    return this.stages.list();
  }

  @Post()
  @AdministratorOnly()
  @ZodResponse({ status: 201, type: ExecutionStageDto })
  create(@Body() data: ExecutionStageDataDto) {
    return this.stages.create(data.name);
  }

  @Put('order')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: [ExecutionStageDto] })
  reorder(@Body() data: ExecutionStageOrderDto) {
    return this.stages.reorder(data.ids);
  }

  @Patch(':id')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: ExecutionStageDto })
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() data: ExecutionStageDataDto) {
    return this.stages.rename(id, data.name);
  }

  @Delete(':id')
  @AdministratorOnly()
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.stages.delete(id);
  }
}
