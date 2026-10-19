import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { STATUSES } from '../ideas/domain/idea';

const Status = z.enum(STATUSES);
const IdeaRef = z.object({
  number: z.number().int(),
  title: z.string(),
  status: Status,
  category: z.string(),
});

export class DashboardDto extends createZodDto(
  z.object({
    byStatus: z.array(z.object({ status: Status, total: z.number().int() })),
    byCategory: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        total: z.number().int(),
        // Open or Under review.
        undecided: z.number().int(),
      }),
    ),
    // From publication to the first decision (approved, in progress, done, declined or duplicate).
    firstDecision: z.object({
      decided: z.number().int(),
      averageHours: z.number().nullable(),
    }),
    stalled: z.array(IdeaRef.extend({ days: z.number().int() })),
    mostLikedUndecided: z.array(IdeaRef.extend({ likes: z.number().int() })),
  }),
) {}
