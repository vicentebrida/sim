import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const Reference = z.object({ id: z.uuid(), name: z.string() });

const CompletedIdea = z.object({
  number: z.number().int(),
  title: z.string(),
  category: Reference,
  completedAt: z.iso.datetime(),
  likes: z.number().int(),
  // Only the Author sees their own hidden Ideas here, marked as such.
  hiddenAuthorship: z.boolean(),
});

export class ProfileDto extends createZodDto(
  z.object({
    id: z.uuid(),
    name: z.string(),
    department: z.string().nullable(),
    active: z.boolean(),
    // Recognition is for Ideas that were carried out, never for how many were sent.
    completed: z.array(CompletedIdea),
    likesOnCompleted: z.number().int(),
  }),
) {}

export class RecentlyCompletedDto extends createZodDto(
  z.array(
    CompletedIdea.omit({ likes: true }).extend({
      // A stand-in when the Author chose to hide the name.
      author: Reference,
    }),
  ),
) {}
