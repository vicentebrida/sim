import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { STATUSES } from '../ideas/domain/idea';

const Status = z.enum(STATUSES);

export class StatusSettingDto extends createZodDto(
  z.object({
    status: Status,
    // Null keeps the translated default name.
    label: z.string().nullable(),
    // `#rrggbb`, or null for the default color.
    color: z.string().nullable(),
    description: z.string(),
    enabled: z.boolean(),
    // Only these can be turned off.
    optional: z.boolean(),
  }),
) {}

export class StatusSettingUpdateDto extends createZodDto(
  z.object({
    label: z.string().trim().min(1).max(40).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use the #rrggbb format')
      .nullable()
      .optional(),
    description: z.string().trim().max(280).optional(),
    enabled: z.boolean().optional(),
  }),
) {}
