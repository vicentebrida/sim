import { describe, expect, it } from 'vitest';
import { DomainError } from '../../common/domain-error';
import { type FieldDefinition, normalizeValues } from './fields';

const field = (partial: Partial<FieldDefinition> & Pick<FieldDefinition, 'id' | 'type'>) =>
  ({
    label: partial.id,
    required: false,
    options: [],
    active: true,
    ...partial,
  }) as FieldDefinition;

const situation = field({ id: 'situation', type: 'long_text', required: true });
const area = field({ id: 'area', type: 'single_choice', options: ['Fábrica', 'Escritório'] });
const systems = field({ id: 'systems', type: 'multiple_choice', options: ['ERP', 'CRM', 'BI'] });
const savings = field({ id: 'savings', type: 'number' });
const urgent = field({ id: 'urgent', type: 'yes_no', required: true });
const code = field({ id: 'code', type: 'short_text' });
const old = field({ id: 'old', type: 'short_text', active: false, required: true });
const fields = [situation, area, systems, savings, urgent, code, old];

function problems(action: () => unknown) {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'INVALID_FIELDS') return error.details;
    throw error;
  }
  return undefined;
}

describe('Custom Field values', () => {
  it('accepts valid values of every type and drops empty ones', () => {
    const values = normalizeValues(
      fields,
      {
        situation: '  The report takes 2h  ',
        area: 'Fábrica',
        systems: ['ERP', 'BI'],
        savings: 1500.5,
        urgent: false,
        code: '',
      },
      {},
      { enforceRequired: true },
    );
    expect(values).toEqual({
      situation: 'The report takes 2h',
      area: 'Fábrica',
      systems: ['ERP', 'BI'],
      savings: 1500.5,
      urgent: false,
    });
  });

  it('points out each invalid field', () => {
    expect(
      problems(() =>
        normalizeValues(
          fields,
          {
            area: 'Other',
            systems: ['ERP', 'ERP'],
            savings: 'a lot',
            urgent: 'yes',
            code: 'x'.repeat(201),
          },
          {},
          { enforceRequired: false },
        ),
      ),
    ).toEqual({
      area: 'invalid_option',
      systems: 'invalid_option',
      savings: 'number_expected',
      urgent: 'yes_no_expected',
      code: 'too_long',
    });
  });

  it('rejects unknown or deactivated fields', () => {
    expect(
      problems(() =>
        normalizeValues(fields, { ghost: 'x', old: 'y' }, {}, { enforceRequired: false }),
      ),
    ).toEqual({ ghost: 'unknown_field', old: 'unknown_field' });
  });

  it('enforces required fields only when asked (publishing), and not deactivated ones', () => {
    expect(normalizeValues(fields, {}, {}, { enforceRequired: false })).toEqual({});
    expect(
      problems(() => normalizeValues(fields, { situation: ' ' }, {}, { enforceRequired: true })),
    ).toEqual({ situation: 'required', urgent: 'required' });
  });

  it('keeps values already stored in fields deactivated later', () => {
    expect(
      normalizeValues(
        fields,
        { situation: 'New version', urgent: true },
        { situation: 'Old version', old: 'value from when the field existed' },
        { enforceRequired: true },
      ),
    ).toEqual({
      situation: 'New version',
      urgent: true,
      old: 'value from when the field existed',
    });
  });
});
