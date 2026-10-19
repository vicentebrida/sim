import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentCollaborator } from '../auth/decorators';
import type { Collaborator } from '../database/schema';
import {
  ListNotificationsQueryDto,
  NotificationPageDto,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
  UnreadCountDto,
} from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ZodResponse({ status: 200, type: NotificationPageDto })
  list(
    @CurrentCollaborator() collaborator: Collaborator,
    @Query() filter: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(collaborator, filter);
  }

  /** Cheap endpoint for the web app to poll. */
  @Get('unread-count')
  @ZodResponse({ status: 200, type: UnreadCountDto })
  async unreadCount(@CurrentCollaborator() collaborator: Collaborator) {
    return { unread: await this.notifications.countUnread(collaborator) };
  }

  @Post('read-all')
  @HttpCode(204)
  @ApiNoContentResponse()
  markAllRead(@CurrentCollaborator() collaborator: Collaborator) {
    return this.notifications.markAllRead(collaborator);
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  markRead(
    @CurrentCollaborator() collaborator: Collaborator,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(collaborator, id);
  }

  @Get('preferences')
  @ZodResponse({ status: 200, type: NotificationPreferencesDto })
  preferences(@CurrentCollaborator() collaborator: Collaborator) {
    return this.notifications.preferences(collaborator);
  }

  @Put('preferences')
  @ZodResponse({ status: 200, type: NotificationPreferencesDto })
  setPreferences(
    @CurrentCollaborator() collaborator: Collaborator,
    @Body() data: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.setPreferences(collaborator, data);
  }
}
