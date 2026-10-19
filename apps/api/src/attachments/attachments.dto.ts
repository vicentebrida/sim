import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AttachmentSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  contentType: z.string(),
  // Bytes.
  size: z.number().int(),
  // Shown as a thumbnail; the others are downloads.
  image: z.boolean(),
});

export class AttachmentDto extends createZodDto(AttachmentSchema) {}
