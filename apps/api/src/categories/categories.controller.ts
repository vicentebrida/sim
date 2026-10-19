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
  CategoryDto,
  CategoryUpdateDto,
  ListCategoriesQueryDto,
  NewCategoryDto,
  ReviewersDto,
} from './categories.dto';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ZodResponse({ status: 200, type: [CategoryDto] })
  list(@Query() query: ListCategoriesQueryDto, @CurrentCollaborator() collaborator: Collaborator) {
    return this.categories.list({
      includeInactive: query.includeInactive && collaborator.administrator,
    });
  }

  @Post()
  @AdministratorOnly()
  @ZodResponse({ status: 201, type: CategoryDto })
  create(@Body() data: NewCategoryDto) {
    return this.categories.create(data);
  }

  @Patch(':id')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: CategoryDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() data: CategoryUpdateDto) {
    return this.categories.update(id, data);
  }

  @Put(':id/reviewers')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: CategoryDto })
  setReviewers(@Param('id', ParseUUIDPipe) id: string, @Body() data: ReviewersDto) {
    return this.categories.setReviewers(id, data.collaboratorIds);
  }

  @Delete(':id')
  @AdministratorOnly()
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.delete(id);
  }
}
