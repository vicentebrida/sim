import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});

export class HealthDto extends createZodDto(HealthSchema) {}
