import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DomainError } from '../common/domain-error';
import { DB, type Database } from '../database/database.module';
import { isUniqueViolation } from '../database/errors';
import { type Category, categories, collaborators, ideas, reviewers } from '../database/schema';

export interface CategoryWithReviewers extends Category {
  reviewers: { id: string; name: string }[];
}

const nameTaken = () =>
  new DomainError('CATEGORY_NAME_TAKEN', 'A Category with this name already exists');

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(filter: { includeInactive: boolean; id?: string }): Promise<CategoryWithReviewers[]> {
    const list = await this.db
      .select()
      .from(categories)
      .where(
        and(
          filter.includeInactive ? undefined : eq(categories.active, true),
          filter.id ? eq(categories.id, filter.id) : undefined,
        ),
      )
      .orderBy(asc(categories.name));
    if (!list.length) return [];

    const assignments = await this.db
      .select({
        categoryId: reviewers.categoryId,
        id: collaborators.id,
        name: collaborators.name,
      })
      .from(reviewers)
      .innerJoin(collaborators, eq(reviewers.collaboratorId, collaborators.id))
      .where(
        inArray(
          reviewers.categoryId,
          list.map((category) => category.id),
        ),
      )
      .orderBy(asc(collaborators.name));

    return list.map((category) => ({
      ...category,
      reviewers: assignments
        .filter((assignment) => assignment.categoryId === category.id)
        .map(({ id, name }) => ({ id, name })),
    }));
  }

  async find(id: string): Promise<CategoryWithReviewers> {
    const [category] = await this.list({ includeInactive: true, id });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(data: { name: string; description: string }) {
    try {
      const [category] = await this.db.insert(categories).values(data).returning();
      return { ...category!, reviewers: [] };
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      active?: boolean;
      stalledOpenDays?: number | null;
      stalledReviewDays?: number | null;
    },
  ) {
    try {
      const [updated] = await this.db
        .update(categories)
        .set(data)
        .where(eq(categories.id, id))
        .returning({ id: categories.id });
      if (!updated) throw new NotFoundException('Category not found');
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
    return this.find(id);
  }

  /** Replaces the Category's Reviewers. Only active Collaborators can review. */
  async setReviewers(id: string, collaboratorIds: string[]) {
    await this.find(id);
    if (collaboratorIds.length) {
      const valid = await this.db
        .select({ id: collaborators.id })
        .from(collaborators)
        .where(and(inArray(collaborators.id, collaboratorIds), eq(collaborators.active, true)));
      if (valid.length !== collaboratorIds.length) {
        throw new DomainError('INACTIVE_REVIEWERS', 'Reviewers must be active Collaborators');
      }
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(reviewers).where(eq(reviewers.categoryId, id));
      if (collaboratorIds.length) {
        await tx
          .insert(reviewers)
          .values(collaboratorIds.map((collaboratorId) => ({ categoryId: id, collaboratorId })));
      }
    });
    return this.find(id);
  }

  /** Categories that already received Ideas can only be deactivated. */
  async delete(id: string) {
    await this.find(id);
    const [withIdea] = await this.db
      .select({ id: ideas.id })
      .from(ideas)
      .where(eq(ideas.categoryId, id))
      .limit(1);
    if (withIdea) {
      throw new DomainError(
        'CATEGORY_IN_USE',
        'This Category has Ideas; deactivate it instead of deleting',
      );
    }
    await this.db.delete(categories).where(eq(categories.id, id));
  }
}
