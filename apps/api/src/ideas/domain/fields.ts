import { DomainError } from '../../common/domain-error';

export const FIELD_TYPES = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'number',
  'yes_no',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldValue = string | number | boolean | string[] | null;
export type FieldValues = Record<string, FieldValue>;

/** Why a value was rejected; the web app translates it next to the field. */
export type FieldProblem =
  | 'unknown_field'
  | 'required'
  | 'text_expected'
  | 'too_long'
  | 'invalid_option'
  | 'number_expected'
  | 'yes_no_expected';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  active: boolean;
  /** Categories the field applies to; empty means all of them. */
  categoryIds: string[];
}

/** The fields an Idea of this Category fills in (deactivated ones only keep what they have). */
export function fieldsFor(fields: FieldDefinition[], categoryId: string): FieldDefinition[] {
  return fields.filter(
    (field) =>
      !field.active || field.categoryIds.length === 0 || field.categoryIds.includes(categoryId),
  );
}

export const TEXT_LIMIT: Partial<Record<FieldType, number>> = {
  short_text: 200,
  long_text: 10_000,
};

function isEmpty(value: FieldValue | undefined) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Returns the normalized value, or the problem found. */
function validate(
  field: FieldDefinition,
  value: FieldValue,
): { value: FieldValue } | { problem: FieldProblem } {
  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      if (typeof value !== 'string') return { problem: 'text_expected' };
      const text = value.trim();
      return text.length > TEXT_LIMIT[field.type]! ? { problem: 'too_long' } : { value: text };
    }
    case 'single_choice':
      return typeof value === 'string' && field.options.includes(value)
        ? { value }
        : { problem: 'invalid_option' };
    case 'multiple_choice':
      return Array.isArray(value) &&
        new Set(value).size === value.length &&
        value.every((option) => field.options.includes(option))
        ? { value }
        : { problem: 'invalid_option' };
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { value }
        : { problem: 'number_expected' };
    case 'yes_no':
      return typeof value === 'boolean' ? { value } : { problem: 'yes_no_expected' };
  }
}

/**
 * Validates and normalizes the values sent for an Idea's Custom Fields.
 *
 * - Only active fields take values; values already stored in deactivated fields are kept (the
 *   field leaves the form but stays on the Idea).
 * - Required fields are only enforced on publishing: a Draft may be incomplete, and a required
 *   field created later does not invalidate older Ideas.
 */
export function normalizeValues(
  fields: FieldDefinition[],
  sent: FieldValues,
  existing: FieldValues,
  options: { enforceRequired: boolean },
): FieldValues {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const problems: Record<string, FieldProblem> = {};
  const result: FieldValues = {};

  for (const [id, value] of Object.entries(existing)) {
    if (byId.get(id)?.active === false) result[id] = value;
  }

  for (const [id, value] of Object.entries(sent)) {
    const field = byId.get(id);
    if (!field?.active) {
      problems[id] = 'unknown_field';
      continue;
    }
    if (isEmpty(value)) continue;
    const validated = validate(field, value);
    if ('problem' in validated) problems[id] = validated.problem;
    else if (!isEmpty(validated.value)) result[id] = validated.value;
  }

  if (options.enforceRequired) {
    for (const field of fields) {
      if (field.active && field.required && !(field.id in result) && !problems[field.id]) {
        problems[field.id] = 'required';
      }
    }
  }

  if (Object.keys(problems).length) {
    throw new DomainError('INVALID_FIELDS', 'Some fields are invalid', problems);
  }
  return result;
}
