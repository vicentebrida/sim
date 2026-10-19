import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, max, sql } from 'drizzle-orm';
import { DomainError } from '../common/domain-error';
import { DB, type Database } from '../database/database.module';
import { type CustomField, customFields, ideas } from '../database/schema';
import type { FieldType } from '../ideas/domain/fields';

const TYPES_WITH_OPTIONS: FieldType[] = ['single_choice', 'multiple_choice'];
const TEXT_TYPES: FieldType[] = ['short_text', 'long_text'];

function assertValidConfiguration(field: {
  type: FieldType;
  options: string[];
  useForDetection: boolean;
}) {
  if (TYPES_WITH_OPTIONS.includes(field.type) && field.options.length < 2) {
    throw new DomainError('FIELD_OPTIONS_REQUIRED', 'Choice fields need at least two options');
  }
  if (!TYPES_WITH_OPTIONS.includes(field.type) && field.options.length) {
    throw new DomainError('FIELD_OPTIONS_NOT_ALLOWED', 'Only choice fields have options');
  }
  if (field.useForDetection && !TEXT_TYPES.includes(field.type)) {
    throw new DomainError(
      'FIELD_DETECTION_TEXT_ONLY',
      'Only text fields feed Similar Idea detection',
    );
  }
}

@Injectable()
export class CustomFieldsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list({ includeInactive }: { includeInactive: boolean }): Promise<CustomField[]> {
    return this.db
      .select()
      .from(customFields)
      .where(includeInactive ? undefined : eq(customFields.active, true))
      .orderBy(asc(customFields.position), asc(customFields.createdAt));
  }

  private async find(id: string) {
    const [field] = await this.db.select().from(customFields).where(eq(customFields.id, id));
    if (!field) throw new NotFoundException('Custom Field not found');
    return field;
  }

  async create(data: Omit<CustomField, 'id' | 'position' | 'active' | 'createdAt'>) {
    assertValidConfiguration(data);
    const [{ last }] = (await this.db
      .select({ last: max(customFields.position) })
      .from(customFields)) as [{ last: number | null }];
    const [field] = await this.db
      .insert(customFields)
      .values({ ...data, position: (last ?? 0) + 1 })
      .returning();
    return field!;
  }

  async update(
    id: string,
    data: Partial<
      Pick<CustomField, 'label' | 'help' | 'required' | 'options' | 'useForDetection' | 'active'>
    >,
  ) {
    const current = await this.find(id);
    assertValidConfiguration({ ...current, ...data });
    const [field] = await this.db
      .update(customFields)
      .set(data)
      .where(eq(customFields.id, id))
      .returning();
    return field!;
  }

  /** Sets the display order; the list must contain every field, active and inactive. */
  async reorder(ids: string[]) {
    const all = await this.list({ includeInactive: true });
    const expected = new Set(all.map((field) => field.id));
    if (ids.length !== expected.size || !ids.every((id) => expected.has(id))) {
      throw new DomainError('FIELD_ORDER_INCOMPLETE', 'Send every field exactly once');
    }
    await this.db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(customFields)
          .set({ position: index + 1 })
          .where(eq(customFields.id, id));
      }
    });
    return this.list({ includeInactive: true });
  }

  async delete(id: string) {
    await this.find(id);
    const [inUse] = await this.db
      .select({ id: ideas.id })
      .from(ideas)
      .where(sql`jsonb_exists(${ideas.values}, ${id})`)
      .limit(1);
    if (inUse) {
      throw new DomainError(
        'FIELD_IN_USE',
        'This field was already filled in on Ideas; deactivate it instead of deleting',
      );
    }
    await this.db.delete(customFields).where(eq(customFields.id, id));
  }
}
