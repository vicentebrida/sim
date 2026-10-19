import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, ne } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { type Collaborator, collaborators, sessions } from '../database/schema';

export const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
// Sessions in use are renewed when less than half of their duration is left.
const RENEW_BELOW_MS = SESSION_DURATION_MS / 2;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(collaboratorId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(sessions).values({
      tokenHash: hashToken(token),
      collaboratorId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    });
    return token;
  }

  /** Returns the Collaborator owning a valid session, or `undefined`. */
  async validate(token: string): Promise<Collaborator | undefined> {
    const tokenHash = hashToken(token);
    const [row] = await this.db
      .select({ collaborator: collaborators, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(collaborators, eq(sessions.collaboratorId, collaborators.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));

    if (!row || !row.collaborator.active) return undefined;

    if (row.expiresAt.getTime() - Date.now() < RENEW_BELOW_MS) {
      await this.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + SESSION_DURATION_MS) })
        .where(eq(sessions.tokenHash, tokenHash));
    }
    return row.collaborator;
  }

  async end(token: string) {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  /** Ends the Collaborator's other sessions (e.g. after changing the password). */
  async endOthers(collaboratorId: string, currentToken: string) {
    await this.db
      .delete(sessions)
      .where(
        and(
          eq(sessions.collaboratorId, collaboratorId),
          ne(sessions.tokenHash, hashToken(currentToken)),
        ),
      );
  }
}
