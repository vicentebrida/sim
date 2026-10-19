import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const name = z.string().trim().min(1).max(60);
const description = z.string().trim().max(280);

export class CategoryDto extends createZodDto(
  z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    active: z.boolean(),
    reviewers: z.array(z.object({ id: z.uuid(), name: z.string() })),
  }),
) {}

export class ListCategoriesQueryDto extends createZodDto(
  z.object({
    // Only applies to Administrators; other Collaborators see active Categories only.
    includeInactive: z.stringbool().default(false),
  }),
) {}

export class NewCategoryDto extends createZodDto(
  z.object({ name, description: description.default('') }),
) {}

export class CategoryUpdateDto extends createZodDto(
  z.object({
    name: name.optional(),
    description: description.optional(),
    active: z.boolean().optional(),
  }),
) {}

export class ReviewersDto extends createZodDto(
  z.object({
    collaboratorIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Repeated ids'),
  }),
) {}
