import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AttachmentSchema } from '../attachments/attachments.dto';
import { TagSchema } from '../tags/tags.dto';
import { FIELD_TYPES } from './domain/fields';
import { SORT_ORDERS, STATUSES } from './domain/idea';

const ValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const ValuesSchema = z.record(z.string(), ValueSchema);
const title = z.string().trim().min(1).max(120);
const justification = z.string().trim().min(1).max(2000);
const StatusSchema = z.enum(STATUSES);
const Reference = z.object({ id: z.uuid(), name: z.string() });
const TagIds = z
  .array(z.uuid())
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, 'Repeated ids');

export class NewIdeaDto extends createZodDto(
  z.object({
    title,
    categoryId: z.uuid(),
    values: ValuesSchema.default({}),
    // false saves a Draft; true publishes it (requires the required fields).
    publish: z.boolean().default(false),
    // Needs the Hidden authorship setting.
    hiddenAuthorship: z.boolean().optional(),
    tagIds: TagIds.default([]),
  }),
) {}

export class IdeaTagsDto extends createZodDto(z.object({ tagIds: TagIds })) {}

export class IdeaUpdateDto extends createZodDto(
  z.object({
    title: title.optional(),
    categoryId: z.uuid().optional(),
    values: ValuesSchema.optional(),
    hiddenAuthorship: z.boolean().optional(),
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
    tagId: z.uuid().optional(),
    // "me" lists the current Collaborator's Ideas, Drafts included.
    author: z.enum(['me']).optional(),
    // Only Ideas the current Collaborator follows.
    following: z.stringbool().optional(),
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

export class SimilarIdeasQueryDto extends createZodDto(
  z.object({
    title: z.string().trim().min(3).max(120),
    // Text of the Custom Fields marked for detection, joined by the web app.
    text: z.string().trim().max(2000).default(''),
    // Number of the Idea being edited, so it does not show up as similar to itself.
    exclude: z.coerce.number().int().positive().optional(),
  }),
) {}

export class SimilarIdeaDto extends createZodDto(
  z.object({
    number: z.number().int(),
    title: z.string(),
    status: StatusSchema,
    category: Reference,
    likes: z.number().int(),
    // Between 0 and 1; higher means more similar.
    score: z.number(),
  }),
) {}

export class FollowingDto extends createZodDto(z.object({ following: z.boolean() })) {}

export class LikeDto extends createZodDto(
  z.object({ collaborator: Reference, createdAt: z.iso.datetime() }),
) {}

const IdeaSummarySchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  status: StatusSchema,
  category: Reference,
  tags: z.array(TagSchema),
  // For anyone but the Author, a stand-in when the Author chose to hide the name.
  author: Reference,
  hiddenAuthorship: z.boolean(),
  likes: LikesSchema,
  // Past the deadline for its Status. Only Administrators and the Category Reviewers ever see true.
  stalled: z.boolean(),
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
    // The current Collaborator follows this Idea.
    following: z.boolean(),
    attachments: z.array(AttachmentSchema),
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
        // Null when the SIM did it by itself (automatic archiving).
        collaborator: Reference.nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
    permissions: z.object({
      canEdit: z.boolean(),
      canDelete: z.boolean(),
      canPublish: z.boolean(),
      // Change the Tags (PUT /ideas/:number/tags).
      canTag: z.boolean(),
      canLike: z.boolean(),
      canReview: z.boolean(),
      canRecategorize: z.boolean(),
      transitions: z.array(StatusSchema),
    }),
  }),
) {}

export class IdeaVersionDto extends createZodDto(
  z.object({
    // 1 is the text as first published.
    version: z.number().int(),
    title: z.string(),
    category: Reference,
    answers: z.array(
      z.object({
        fieldId: z.uuid(),
        label: z.string(),
        type: z.enum(FIELD_TYPES),
        value: ValueSchema,
      }),
    ),
    validFrom: z.iso.datetime(),
    replacedAt: z.iso.datetime(),
  }),
) {}

export class AuthorDto extends createZodDto(Reference) {}
