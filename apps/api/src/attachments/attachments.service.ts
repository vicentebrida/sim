import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { assertCanEditComment, canReadText } from '../comments/domain/comment';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { type Attachment, attachments, type Collaborator, comments } from '../database/schema';
import { assertCanEdit } from '../ideas/domain/idea';
import { IdeasService } from '../ideas/ideas.service';
import { presentAttachment } from './attachment-store';
import { cleanFilename, detectFileType } from './domain/file-type';
import { FileStorage } from './file-storage';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

const commentRules = (comment: typeof comments.$inferSelect) => ({
  authorId: comment.authorId,
  replyToId: comment.replyToId,
  removed: comment.removedAt !== null,
  hidden: comment.hiddenAt !== null,
});

/**
 * Sending, downloading and deleting Attachments. Who can add or delete follows who can edit the
 * item (Idea: its Author while it can be edited; Comment: whoever wrote it).
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly ideas: IdeasService,
    private readonly storage: FileStorage,
  ) {}

  async addToIdea(collaborator: Collaborator, number: number, file: UploadedFile | undefined) {
    const { idea, actor } = await this.ideas.access(collaborator, { number });
    assertCanEdit(idea, actor);
    return this.save(collaborator, file, { ideaId: idea.id, commentId: null });
  }

  async addToComment(
    collaborator: Collaborator,
    commentId: string,
    file: UploadedFile | undefined,
  ) {
    const comment = await this.findComment(commentId);
    const { actor } = await this.ideas.access(collaborator, { id: comment.ideaId });
    assertCanEditComment(commentRules(comment), actor);
    return this.save(collaborator, file, { ideaId: comment.ideaId, commentId });
  }

  async download(collaborator: Collaborator, id: string) {
    const attachment = await this.find(id);
    const { idea, actor } = await this.ideas.access(collaborator, { id: attachment.ideaId });
    if (attachment.commentId) {
      const comment = await this.findComment(attachment.commentId);
      // What the text hides, the files hide too.
      if (!canReadText(commentRules(comment), idea, actor)) {
        throw new NotFoundException('Attachment not found');
      }
    }
    return { attachment, stream: this.storage.read(attachment.storageKey) };
  }

  async remove(collaborator: Collaborator, id: string) {
    const attachment = await this.find(id);
    const { idea, actor } = await this.ideas.access(collaborator, { id: attachment.ideaId });
    if (attachment.commentId) {
      assertCanEditComment(commentRules(await this.findComment(attachment.commentId)), actor);
    } else {
      assertCanEdit(idea, actor);
    }
    await this.db.delete(attachments).where(eq(attachments.id, id));
    await this.storage.remove(attachment.storageKey);
  }

  // ---------- support ----------

  private async save(
    collaborator: Collaborator,
    file: UploadedFile | undefined,
    target: { ideaId: string; commentId: string | null },
  ) {
    if (!file) throw new DomainError('FILE_REQUIRED', 'Send the file in the "file" field');
    const maxBytes = this.env.SIM_ATTACHMENT_MAX_MB * 1024 * 1024;
    if (file.buffer.length > maxBytes) {
      throw new DomainError('ATTACHMENT_TOO_LARGE', 'The file is larger than the allowed size');
    }
    const filename = cleanFilename(Buffer.from(file.originalname, 'latin1').toString('utf8'));
    const type = detectFileType(filename, file.buffer);
    if (!type) {
      throw new DomainError('ATTACHMENT_TYPE_NOT_ALLOWED', 'This type of file is not allowed');
    }

    const [existing] = await this.db
      .select({ total: count() })
      .from(attachments)
      .where(
        and(
          eq(attachments.ideaId, target.ideaId),
          target.commentId
            ? eq(attachments.commentId, target.commentId)
            : isNull(attachments.commentId),
        ),
      );
    if ((existing?.total ?? 0) >= this.env.SIM_ATTACHMENT_MAX_COUNT) {
      throw new DomainError('TOO_MANY_ATTACHMENTS', 'The limit of Attachments was reached');
    }

    const storageKey = randomUUID();
    await this.storage.save(storageKey, file.buffer);
    try {
      const [created] = await this.db
        .insert(attachments)
        .values({
          ...target,
          uploaderId: collaborator.id,
          filename,
          contentType: type.contentType,
          size: file.buffer.length,
          storageKey,
        })
        .returning();
      return presentAttachment(created!);
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  private async find(id: string): Promise<Attachment> {
    const [attachment] = await this.db.select().from(attachments).where(eq(attachments.id, id));
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  private async findComment(id: string) {
    const [comment] = await this.db.select().from(comments).where(eq(comments.id, id));
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}
