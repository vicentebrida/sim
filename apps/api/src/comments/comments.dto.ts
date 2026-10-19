import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AttachmentSchema } from '../attachments/attachments.dto';

const Reference = z.object({ id: z.uuid(), name: z.string() });
// Mentions go in the text as `@[Name](id)`.
const text = z.string().trim().min(1).max(5000);

export class NewCommentDto extends createZodDto(
  z.object({
    text,
    // Id of the Comment being replied to, when this is a Reply.
    replyToId: z.uuid().optional(),
  }),
) {}

export class CommentUpdateDto extends createZodDto(z.object({ text })) {}

export class CommentHidingDto extends createZodDto(
  z.object({ reason: z.string().trim().min(1).max(1000) }),
) {}

const CommentBaseSchema = z.object({
  id: z.uuid(),
  author: Reference,
  // Null when removed, or hidden from someone who neither wrote it nor moderates.
  text: z.string().nullable(),
  state: z.enum(['published', 'removed', 'hidden']),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  attachments: z.array(AttachmentSchema),
  hiding: z.object({ reason: z.string(), by: Reference, at: z.iso.datetime() }).nullable(),
  permissions: z.object({
    canReply: z.boolean(),
    canEdit: z.boolean(),
    canRemove: z.boolean(),
    canHide: z.boolean(),
  }),
});

export class CommentDto extends createZodDto(
  CommentBaseSchema.extend({
    // Only Comments have Replies; on a Reply the list is empty.
    replies: z.array(CommentBaseSchema),
  }),
) {}
