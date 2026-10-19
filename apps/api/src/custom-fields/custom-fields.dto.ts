import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { FIELD_TYPES } from '../ideas/domain/fields';

const label = z.string().trim().min(1).max(80);
const help = z.string().trim().max(280);
const options = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .refine((list) => new Set(list).size === list.length, 'Repeated options');

export const CustomFieldSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  help: z.string(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string()),
  useForDetection: z.boolean(),
  position: z.number().int(),
  active: z.boolean(),
});

export class CustomFieldDto extends createZodDto(CustomFieldSchema) {}

export class ListCustomFieldsQueryDto extends createZodDto(
  z.object({ includeInactive: z.stringbool().default(false) }),
) {}

export class NewCustomFieldDto extends createZodDto(
  z.object({
    label,
    help: help.default(''),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: options.default([]),
    useForDetection: z.boolean().default(false),
  }),
) {}

/** The type does not change after creation: stored values depend on it. */
export class CustomFieldUpdateDto extends createZodDto(
  z.object({
    label: label.optional(),
    help: help.optional(),
    required: z.boolean().optional(),
    options: options.optional(),
    useForDetection: z.boolean().optional(),
    active: z.boolean().optional(),
  }),
) {}

export class CustomFieldOrderDto extends createZodDto(
  z.object({ ids: z.array(z.uuid()).min(1) }),
) {}
