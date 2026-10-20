import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { EMAIL_MODES } from '../database/schema';
import { NOTIFICATION_TYPES } from './domain/recipients';

export class ListNotificationsQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

const NotificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  idea: z.object({ number: z.number().int(), title: z.string() }),
  // Null for system notices.
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  commentId: z.uuid().nullable(),
  // Depends on the type: `status` has { from, to }; `duplicate` has { original: { number, title } }.
  data: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  read: z.boolean(),
});

export class NotificationPageDto extends createZodDto(
  z.object({
    items: z.array(NotificationSchema),
    total: z.number().int(),
    unread: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class UnreadCountDto extends createZodDto(z.object({ unread: z.number().int() })) {}

export class NotificationPreferencesDto extends createZodDto(
  z.object({
    // Notification of new Comments on followed Ideas.
    newComments: z.boolean(),
    // Notifications by e-mail: as they happen, once a day in a summary, or never.
    email: z.enum(EMAIL_MODES),
    // Whether this installation sends e-mail at all (SMTP configured).
    emailAvailable: z.boolean(),
  }),
) {}

export class UpdateNotificationPreferencesDto extends createZodDto(
  z.object({ newComments: z.boolean().optional(), email: z.enum(EMAIL_MODES).optional() }),
) {}
