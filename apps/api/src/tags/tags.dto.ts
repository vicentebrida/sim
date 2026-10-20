import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const TagSchema = z.object({ id: z.uuid(), name: z.string() });

export class TagDto extends createZodDto(TagSchema) {}

export class TagDataDto extends createZodDto(
  z.object({ name: z.string().trim().min(1).max(40) }),
) {}
