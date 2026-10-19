import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CollaboratorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  department: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  administrator: z.boolean(),
  active: z.boolean(),
});

export class CollaboratorDto extends createZodDto(CollaboratorSchema) {}

export class MentionableSearchDto extends createZodDto(
  z.object({ search: z.string().trim().max(120).default('') }),
) {}

export class MentionableDto extends createZodDto(z.object({ id: z.uuid(), name: z.string() })) {}

export class NewLocalAccountDto extends createZodDto(
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().transform((email) => email.toLowerCase()),
    administrator: z.boolean().default(false),
  }),
) {}

export class LocalAccountCreatedDto extends createZodDto(
  z.object({
    collaborator: CollaboratorSchema,
    // Shown once to the Administrator; the Collaborator changes it on first login.
    temporaryPassword: z.string(),
  }),
) {}
