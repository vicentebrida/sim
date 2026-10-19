import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { FIELD_TYPES } from './domain/fields';
import { SORT_ORDERS, STATUSES } from './domain/idea';

const ValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const ValuesSchema = z.record(z.string(), ValueSchema);
const title = z.string().trim().min(1).max(120);
const justification = z.string().trim().min(1).max(2000);
const StatusSchema = z.enum(STATUSES);
const Reference = z.object({ id: z.uuid(), name: z.string() });

export class NewIdeaDto extends createZodDto(
  z.object({
    title,
    categoryId: z.uuid(),
    values: ValuesSchema.default({}),
    // false saves a Draft; true publishes it (requires the required fields).
    publish: z.boolean().default(false),
  }),
) {}

export class IdeaUpdateDto extends createZodDto(
  z.object({
    title: title.optional(),
    categoryId: z.uuid().optional(),
    values: ValuesSchema.optional(),
  }),
) {}

export class StatusChangeDto extends createZodDto(
  z.object({
    to: StatusSchema.exclude(['draft']),
    justification,
    // Required when `to` is "duplicate".
    originalIdeaNumber: z.number().int().positive().optional(),
  }),
) {}

export class RecategorizationDto extends createZodDto(
  z.object({ categoryId: z.uuid(), justification }),
) {}

export class ListIdeasQueryDto extends createZodDto(
  z.object({
    // Comma-separated list. Without it, lists published Ideas except Archived ones.
    status: z
      .string()
      .optional()
      .transform((value) => value?.split(',').filter(Boolean))
      .pipe(z.array(StatusSchema).optional()),
    categoryId: z.uuid().optional(),
    // "me" lists the current Collaborator's Ideas, Drafts included.
    author: z.enum(['me']).optional(),
    // "trending" weighs recent Likes and Comments; "most_liked" counts all Likes.
    sort: z.enum(SORT_ORDERS).default('trending'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

const LikesSchema = z.object({
  total: z.number().int(),
  // The current Collaborator likes this Idea.
  liked: z.boolean(),
});

export class LikesDto extends createZodDto(LikesSchema) {}

export class LikeDto extends createZodDto(
  z.object({ collaborator: Reference, createdAt: z.iso.datetime() }),
) {}

const IdeaSummarySchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  status: StatusSchema,
  category: Reference,
  author: Reference,
  likes: LikesSchema,
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
});

export class IdeaPageDto extends createZodDto(
  z.object({
    items: z.array(IdeaSummarySchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}

export class IdeaDto extends createZodDto(
  IdeaSummarySchema.extend({
    editedAt: z.iso.datetime().nullable(),
    values: ValuesSchema,
    // Values ready for display, in field order (includes deactivated fields).
    answers: z.array(
      z.object({
        fieldId: z.uuid(),
        label: z.string(),
        type: z.enum(FIELD_TYPES),
        value: ValueSchema,
      }),
    ),
    originalIdea: z.object({ number: z.number().int(), title: z.string() }).nullable(),
    history: z.array(
      z.object({
        id: z.uuid(),
        type: z.enum(['status', 'category']),
        from: z.string().nullable(),
        to: z.string(),
        justification: z.string().nullable(),
        collaborator: Reference,
        createdAt: z.iso.datetime(),
      }),
    ),
    permissions: z.object({
      canEdit: z.boolean(),
      canDelete: z.boolean(),
      canPublish: z.boolean(),
      canLike: z.boolean(),
      canReview: z.boolean(),
      canRecategorize: z.boolean(),
      transitions: z.array(StatusSchema),
    }),
  }),
) {}
