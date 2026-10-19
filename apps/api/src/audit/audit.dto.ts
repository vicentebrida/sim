import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class ListAuditQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
  }),
) {}

export class AuditPageDto extends createZodDto(
  z.object({
    items: z.array(
      z.object({
        id: z.uuid(),
        action: z.string(),
        targetType: z.string(),
        targetId: z.string(),
        details: z.record(z.string(), z.unknown()),
        // Null when the system acted.
        actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  }),
) {}
