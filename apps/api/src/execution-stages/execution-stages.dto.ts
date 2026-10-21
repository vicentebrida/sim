import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ExecutionStageSchema = z.object({ id: z.uuid(), name: z.string() });

export class ExecutionStageDto extends createZodDto(ExecutionStageSchema) {}

export class ExecutionStageDataDto extends createZodDto(
  z.object({ name: z.string().trim().min(1).max(40) }),
) {}

export class ExecutionStageOrderDto extends createZodDto(
  z.object({ ids: z.array(z.uuid()).max(20) }),
) {}
