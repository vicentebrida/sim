import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
  AuthorDto,
  FollowingDto,
  IdeaDto,
  IdeaPageDto,
  IdeaUpdateDto,
  LikeDto,
  LikesDto,
  ListIdeasQueryDto,
  NewIdeaDto,
  RecategorizationDto,
  SimilarIdeaDto,
  SimilarIdeasQueryDto,
  StatusChangeDto,
} from './ideas.dto';
import { IdeasService } from './ideas.service';

@ApiTags('ideas')
@Controller('ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  @ZodResponse({ status: 200, type: IdeaPageDto })
  list(@CurrentCollaborator() collaborator: Collaborator, @Query() filter: ListIdeasQueryDto) {
    return this.ideas.list(collaborator, filter);
  }

  @Post()
  @ZodResponse({ status: 201, type: IdeaDto })
  create(@CurrentCollaborator() collaborator: Collaborator, @Body() data: NewIdeaDto) {
    return this.ideas.create(collaborator, data);
  }

  // Declared before ':number' so "similar" is not parsed as an Idea number.
  @Get('similar')
  @ZodResponse({ status: 200, type: [SimilarIdeaDto] })
  similar(@Query() query: SimilarIdeasQueryDto) {
    return this.ideas.similar(query);
  }

  @Get(':number')
  @ZodResponse({ status: 200, type: IdeaDto })
  detail(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.detail(collaborator, number);
  }

  @Patch(':number')
  @ZodResponse({ status: 200, type: IdeaDto })
  update(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
    @Body() data: IdeaUpdateDto,
  ) {
    return this.ideas.update(collaborator, number, data);
  }

  /** Shows who wrote an Idea whose Author chose to hide the name. Recorded in the audit log. */
  @Post(':number/reveal-author')
  @AdministratorOnly()
  @ZodResponse({ status: 200, type: AuthorDto })
  revealAuthor(
    @CurrentCollaborator() administrator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.revealAuthor(administrator, number);
  }

  @Post(':number/publish')
  @ZodResponse({ status: 200, type: IdeaDto })
  publish(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.publish(collaborator, number);
  }

  @Post(':number/status')
  @ZodResponse({ status: 200, type: IdeaDto })
  changeStatus(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
    @Body() data: StatusChangeDto,
  ) {
    return this.ideas.changeStatus(collaborator, number, data);
  }

  @Post(':number/category')
  @ZodResponse({ status: 200, type: IdeaDto })
  recategorize(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
    @Body() data: RecategorizationDto,
  ) {
    return this.ideas.recategorize(collaborator, number, data);
  }

  @Delete(':number')
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.delete(collaborator, number);
  }

  @Get(':number/likes')
  @ZodResponse({ status: 200, type: [LikeDto] })
  listLikes(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.listLikes(collaborator, number);
  }

  @Put(':number/like')
  @ZodResponse({ status: 200, type: LikesDto })
  like(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.like(collaborator, number);
  }

  @Delete(':number/like')
  @ZodResponse({ status: 200, type: LikesDto })
  unlike(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.unlike(collaborator, number);
  }

  @Put(':number/follow')
  @ZodResponse({ status: 200, type: FollowingDto })
  follow(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.follow(collaborator, number);
  }

  @Delete(':number/follow')
  @ZodResponse({ status: 200, type: FollowingDto })
  unfollow(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.ideas.unfollow(collaborator, number);
  }
}
