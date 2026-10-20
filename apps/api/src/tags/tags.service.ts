import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DomainError } from '../common/domain-error';
import { DB, type Database, type Executor } from '../database/database.module';
import { isUniqueViolation } from '../database/errors';
import { ideaTags, tags } from '../database/schema';

const nameTaken = () => new DomainError('TAG_NAME_TAKEN', 'A Tag with this name already exists');

@Injectable()
export class TagsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list() {
    return this.db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(asc(tags.name));
  }

  async create(name: string) {
    try {
      const [tag] = await this.db
        .insert(tags)
        .values({ name })
        .returning({ id: tags.id, name: tags.name });
      return tag!;
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  async rename(id: string, name: string) {
    try {
      const [tag] = await this.db
        .update(tags)
        .set({ name })
        .where(eq(tags.id, id))
        .returning({ id: tags.id, name: tags.name });
      if (!tag) throw new NotFoundException('Tag not found');
      return tag;
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }

  /** Also takes the Tag off every Idea. */
  async delete(id: string) {
    const [deleted] = await this.db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
    if (!deleted) throw new NotFoundException('Tag not found');
  }

  /** Tags of each Idea, by name. */
  async ofIdeas(ideaIds: string[], executor: Executor = this.db) {
    const byIdea = new Map<string, { id: string; name: string }[]>(ideaIds.map((id) => [id, []]));
    if (!ideaIds.length) return byIdea;
    const rows = await executor
      .select({ ideaId: ideaTags.ideaId, id: tags.id, name: tags.name })
      .from(ideaTags)
      .innerJoin(tags, eq(ideaTags.tagId, tags.id))
      .where(inArray(ideaTags.ideaId, ideaIds))
      .orderBy(asc(tags.name));
    for (const { ideaId, id, name } of rows) byIdea.get(ideaId)?.push({ id, name });
    return byIdea;
  }

  /** Replaces the Tags of an Idea. */
  async setOnIdea(executor: Executor, ideaId: string, tagIds: string[]) {
    if (tagIds.length) {
      const found = await executor
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.id, tagIds));
      if (found.length !== tagIds.length) {
        throw new DomainError('UNKNOWN_TAG', 'Some of these Tags do not exist');
      }
    }
    await executor.delete(ideaTags).where(eq(ideaTags.ideaId, ideaId));
    if (tagIds.length) {
      await executor.insert(ideaTags).values(tagIds.map((tagId) => ({ ideaId, tagId })));
    }
  }
}
