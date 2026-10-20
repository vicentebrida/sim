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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly } from '../auth/decorators';
import { TagDataDto, TagDto } from './tags.dto';
import { TagsService } from './tags.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ZodResponse({ status: 200, type: [TagDto] })
  list() {
    return this.tags.list();
  }

  @Post()
  @AdministratorOnly()
  @ZodResponse({ status: 201, type: TagDto })
  create(@Body() data: TagDataDto) {
    return this.tags.create(data.name);
  }

  @Patch(':id')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: TagDto })
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() data: TagDataDto) {
    return this.tags.rename(id, data.name);
  }

  @Delete(':id')
  @AdministratorOnly()
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.tags.delete(id);
  }
}
