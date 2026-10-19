import type { CustomFieldDtoOutput } from '@sim/api-client';
import type { FieldValue } from '@/components/idea-form';

const MAX_TEXT_LENGTH = 2000;

/** Text the API compares against existing Ideas: the fields the Administrator marked for detection. */
export function detectionText(fields: CustomFieldDtoOutput[], values: Record<string, FieldValue>) {
  return fields
    .filter((field) => field.useForDetection)
    .map((field) => values[field.id])
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
    .slice(0, MAX_TEXT_LENGTH);
}
