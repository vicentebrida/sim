import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentCollaborator } from '../auth/decorators';
import type { Collaborator } from '../database/schema';
import { CommentDto, CommentHidingDto, CommentUpdateDto, NewCommentDto } from './comments.dto';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('ideas/:number/comments')
  @ZodResponse({ status: 200, type: [CommentDto] })
  list(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.comments.list(collaborator, number);
  }

  @Post('ideas/:number/comments')
  @ZodResponse({ status: 201, type: CommentDto })
  create(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
    @Body() data: NewCommentDto,
  ) {
    return this.comments.create(collaborator, number, data);
  }

  @Patch('comments/:id')
  @ZodResponse({ status: 200, type: CommentDto })
  update(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CommentUpdateDto,
  ) {
    return this.comments.update(collaborator, id, data);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comments.remove(collaborator, id);
  }

  @Post('comments/:id/hide')
  @ZodResponse({ status: 200, type: CommentDto })
  hide(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CommentHidingDto,
  ) {
    return this.comments.hide(collaborator, id, data);
  }
}
