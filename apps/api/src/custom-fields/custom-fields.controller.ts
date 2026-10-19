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
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly, CurrentCollaborator } from '../auth/decorators';
import type { Collaborator } from '../database/schema';
import {
  CustomFieldDto,
  CustomFieldOrderDto,
  CustomFieldUpdateDto,
  ListCustomFieldsQueryDto,
  NewCustomFieldDto,
} from './custom-fields.dto';
import { CustomFieldsService } from './custom-fields.service';

@ApiTags('custom-fields')
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  @ZodResponse({ status: 200, type: [CustomFieldDto] })
  list(
    @Query() query: ListCustomFieldsQueryDto,
    @CurrentCollaborator() collaborator: Collaborator,
  ) {
    return this.fields.list({
      includeInactive: query.includeInactive && collaborator.administrator,
    });
  }

  @Post()
  @AdministratorOnly()
  @ZodResponse({ status: 201, type: CustomFieldDto })
  create(@Body() data: NewCustomFieldDto) {
    return this.fields.create(data);
  }

  @Put('order')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: [CustomFieldDto] })
  reorder(@Body() data: CustomFieldOrderDto) {
    return this.fields.reorder(data.ids);
  }

  @Patch(':id')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: CustomFieldDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() data: CustomFieldUpdateDto) {
    return this.fields.update(id, data);
  }

  @Delete(':id')
  @AdministratorOnly()
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.fields.delete(id);
  }
}
