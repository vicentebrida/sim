import { Inject, Injectable, Logger } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DB, type Database, type Executor } from '../database/database.module';
import { type Attachment, attachments } from '../database/schema';
import { FileStorage } from './file-storage';

export function presentAttachment(attachment: Attachment) {
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    image: attachment.contentType.startsWith('image/'),
  };
}

/** Reading Attachments and cleaning up their files, for the modules that show them. */
@Injectable()
export class AttachmentStore {
  private readonly logger = new Logger(AttachmentStore.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: FileStorage,
  ) {}

  /** Attachments of the Idea itself (not of its Comments). */
  async ofIdea(ideaId: string) {
    const rows = await this.db
      .select()
      .from(attachments)
      .where(eq(attachments.ideaId, ideaId))
      .orderBy(asc(attachments.createdAt));
    return rows.filter((row) => row.commentId === null).map(presentAttachment);
  }

  /** Attachments of each Comment, by comment id. */
  async ofComments(commentIds: string[]) {
    const byComment = new Map<string, ReturnType<typeof presentAttachment>[]>();
    if (!commentIds.length) return byComment;
    const rows = await this.db
      .select()
      .from(attachments)
      .where(inArray(attachments.commentId, commentIds))
      .orderBy(asc(attachments.createdAt));
    for (const row of rows) {
      byComment.set(row.commentId!, [
        ...(byComment.get(row.commentId!) ?? []),
        presentAttachment(row),
      ]);
    }
    return byComment;
  }

  /** Storage keys of an Idea's Attachments (to delete the files after the Idea is gone). */
  async keysOfIdea(ideaId: string, executor: Executor = this.db) {
    const rows = await executor
      .select({ key: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.ideaId, ideaId));
    return rows.map(({ key }) => key);
  }

  /** Removes the rows of a Comment's Attachments and returns their keys. */
  async detachFromComment(commentId: string, executor: Executor = this.db) {
    const rows = await executor
      .delete(attachments)
      .where(eq(attachments.commentId, commentId))
      .returning({ key: attachments.storageKey });
    return rows.map(({ key }) => key);
  }

  /** Deletes files; a failure is logged, not raised (the rows are already gone). */
  async removeFiles(keys: string[]) {
    for (const key of keys) {
      await this.storage.remove(key).catch((error: Error) => {
        this.logger.warn(`Could not delete file ${key}: ${error.message}`);
      });
    }
  }
}
