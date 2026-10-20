import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database, type Transaction } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { renameMention } from '../comments/domain/mentions';
import {
  categories,
  type Collaborator,
  collaborators,
  comments,
  followers,
  mentions,
  reviewers,
  sessions,
} from '../database/schema';

export interface SsoProfile {
  subject: string;
  email: string;
  name: string;
  department?: string;
  pictureUrl?: string;
  /** Groups sent by the provider. */
  groups: string[];
}

@Injectable()
export class CollaboratorsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  private isAdministratorByConfiguration(email: string) {
    return this.env.SIM_ADMIN_EMAILS.includes(email);
  }

  async findByEmail(email: string): Promise<Collaborator | undefined> {
    const [collaborator] = await this.db
      .select()
      .from(collaborators)
      .where(eq(collaborators.email, email.toLowerCase()));
    return collaborator;
  }

  /** Active Collaborators whose name contains the search (accent-insensitive), for Mentions. */
  mentionable(search: string) {
    const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    return this.db
      .select({ id: collaborators.id, name: collaborators.name })
      .from(collaborators)
      .where(
        and(
          eq(collaborators.active, true),
          sql`unaccent(${collaborators.name}) ilike unaccent(${pattern})`,
        ),
      )
      .orderBy(asc(collaborators.name))
      .limit(8);
  }

  list(): Promise<Collaborator[]> {
    return this.db.select().from(collaborators).orderBy(asc(collaborators.name));
  }

  async createLocalAccount(data: { name: string; email: string; administrator: boolean }) {
    const temporaryPassword = generateTemporaryPassword();
    const [collaborator] = await this.db
      .insert(collaborators)
      .values({
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        administrator: data.administrator || this.isAdministratorByConfiguration(data.email),
      })
      .onConflictDoNothing({ target: collaborators.email })
      .returning();
    if (!collaborator) {
      throw new DomainError('EMAIL_TAKEN', 'A Collaborator with this e-mail already exists');
    }
    return { collaborator, temporaryPassword };
  }

  async setPassword(collaboratorId: string, password: string) {
    await this.db
      .update(collaborators)
      .set({ passwordHash: await hashPassword(password), mustChangePassword: false })
      .where(eq(collaborators.id, collaboratorId));
  }

  async recordLogin(collaboratorId: string) {
    await this.db
      .update(collaborators)
      .set({ lastLoginAt: new Date() })
      .where(eq(collaborators.id, collaboratorId));
  }

  /**
   * Just-in-time creation on the first SSO login. Links by the provider subject and, without it, by
   * e-mail (e.g. a local account created before SSO was turned on). Profile data is refreshed on
   * every login, since the provider is the source of truth for name and department.
   */
  async provisionFromSso(profile: SsoProfile): Promise<Collaborator> {
    const email = profile.email.toLowerCase();
    const profileData = {
      name: profile.name,
      email,
      ssoSubject: profile.subject,
      department: profile.department ?? null,
      pictureUrl: profile.pictureUrl ?? null,
      lastLoginAt: new Date(),
    };
    const byConfiguration = this.isAdministratorByConfiguration(email);
    const adminGroup = this.env.SIM_ADMIN_GROUP;
    // With an admin group, the provider decides at each login; without it, the e-mail list only promotes.
    const administratorChange = adminGroup
      ? { administrator: byConfiguration || profile.groups.includes(adminGroup) }
      : byConfiguration
        ? { administrator: true }
        : {};

    return this.db.transaction(async (tx) => {
      const [bySubject] = await tx
        .select()
        .from(collaborators)
        .where(eq(collaborators.ssoSubject, profile.subject));
      const [byEmail] = bySubject
        ? []
        : await tx.select().from(collaborators).where(eq(collaborators.email, email));
      const existing = bySubject ?? byEmail;

      const [collaborator] = existing
        ? await tx
            .update(collaborators)
            .set({ ...profileData, ...administratorChange })
            .where(eq(collaborators.id, existing.id))
            .returning()
        : await tx
            .insert(collaborators)
            .values({ ...profileData, ...administratorChange })
            .returning();
      if (collaborator!.active) await this.syncSsoReviewers(tx, collaborator!.id, profile.groups);
      return collaborator!;
    });
  }

  /**
   * Makes the person a Reviewer of each Category whose SSO group they are in, and takes them out
   * of those whose group they left. Reviewers chosen by an Administrator are left alone.
   */
  private async syncSsoReviewers(tx: Transaction, collaboratorId: string, groups: string[]) {
    const withGroup = await tx
      .select({ id: categories.id, ssoGroup: categories.ssoGroup })
      .from(categories)
      .where(isNotNull(categories.ssoGroup));
    const member = withGroup.filter((category) => groups.includes(category.ssoGroup!));
    await tx.delete(reviewers).where(
      and(
        eq(reviewers.collaboratorId, collaboratorId),
        eq(reviewers.viaSso, true),
        member.length
          ? notInArray(
              reviewers.categoryId,
              member.map((category) => category.id),
            )
          : undefined,
      ),
    );
    if (member.length) {
      await tx
        .insert(reviewers)
        .values(
          member.map((category) => ({ categoryId: category.id, collaboratorId, viaSso: true })),
        )
        .onConflictDoNothing();
    }
  }

  // ---------- life cycle (PRD §3.11) ----------

  private async find(id: string): Promise<Collaborator> {
    const [collaborator] = await this.db
      .select()
      .from(collaborators)
      .where(eq(collaborators.id, id));
    if (!collaborator) throw new NotFoundException('Collaborator not found');
    return collaborator;
  }

  /**
   * Deactivating closes the sessions and removes the Reviewer assignments; their content stays
   * with the name visible. Reactivating gives access back (Reviewers are assigned again by hand).
   */
  async setActive(actor: Collaborator, id: string, active: boolean) {
    const target = await this.find(id);
    if (target.anonymizedAt) {
      throw new DomainError('ALREADY_ANONYMIZED', 'An anonymized Collaborator cannot come back');
    }
    if (target.active === active) return target;
    if (!active) {
      if (target.id === actor.id) {
        throw new DomainError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate yourself');
      }
      await this.assertNotLastAdministrator(target);
    }
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(collaborators)
        .set({ active })
        .where(eq(collaborators.id, id))
        .returning();
      if (!active) await this.dropAccess(tx, id);
      await this.audit.record(tx, {
        actorId: actor.id,
        action: active ? 'collaborator.reactivated' : 'collaborator.deactivated',
        targetType: 'collaborator',
        targetId: id,
      });
      return updated!;
    });
  }

  /** Erases the personal data for good; the content stays under "Former collaborator". */
  async anonymize(actor: Collaborator, id: string) {
    const target = await this.find(id);
    if (target.anonymizedAt) {
      throw new DomainError('ALREADY_ANONYMIZED', 'This Collaborator was already anonymized');
    }
    if (target.active) {
      throw new DomainError('NOT_INACTIVE', 'Deactivate the Collaborator before anonymizing');
    }
    const name = this.env.SIM_LOCALE === 'en' ? 'Former collaborator' : 'Ex-colaborador';
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(collaborators)
        .set({
          name,
          email: `anonymized-${id}@anonymized.invalid`,
          passwordHash: null,
          mustChangePassword: false,
          ssoSubject: null,
          department: null,
          pictureUrl: null,
          anonymizedAt: new Date(),
        })
        .where(eq(collaborators.id, id))
        .returning();
      await this.dropAccess(tx, id);
      await tx.delete(followers).where(eq(followers.collaboratorId, id));
      // The name travels inside Comment texts that mention them.
      const mentioning = await tx
        .select({ id: comments.id, text: comments.text })
        .from(mentions)
        .innerJoin(comments, eq(mentions.commentId, comments.id))
        .where(eq(mentions.collaboratorId, id));
      for (const comment of mentioning) {
        await tx
          .update(comments)
          .set({ text: renameMention(comment.text, id, name) })
          .where(eq(comments.id, comment.id));
      }
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'collaborator.anonymized',
        targetType: 'collaborator',
        targetId: id,
      });
      return updated!;
    });
  }

  /**
   * Deactivates, in one go, whoever did not sign in for `days` days. Administrators are left alone
   * (and so is the emergency account), since losing them could lock the installation.
   */
  async deactivateInactive(days: number, now = new Date()): Promise<number> {
    const limit = new Date(now.getTime() - days * 86_400_000);
    const stale = await this.db
      .select({ id: collaborators.id })
      .from(collaborators)
      .where(
        and(
          eq(collaborators.active, true),
          eq(collaborators.administrator, false),
          isNull(collaborators.anonymizedAt),
          lt(sql`coalesce(${collaborators.lastLoginAt}, ${collaborators.createdAt})`, limit),
        ),
      );
    for (const { id } of stale) {
      await this.db.transaction(async (tx) => {
        await tx.update(collaborators).set({ active: false }).where(eq(collaborators.id, id));
        await this.dropAccess(tx, id);
        await this.audit.record(tx, {
          actorId: null,
          action: 'collaborator.auto_deactivated',
          targetType: 'collaborator',
          targetId: id,
          details: { inactivityDays: days },
        });
      });
    }
    return stale.length;
  }

  private async dropAccess(tx: Transaction, id: string) {
    await tx.delete(reviewers).where(eq(reviewers.collaboratorId, id));
    await tx.delete(sessions).where(eq(sessions.collaboratorId, id));
  }

  private async assertNotLastAdministrator(target: Collaborator) {
    if (!target.administrator) return;
    const [others] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(collaborators)
      .where(
        and(
          eq(collaborators.administrator, true),
          eq(collaborators.active, true),
          sql`${collaborators.id} <> ${target.id}`,
        ),
      );
    if (!others?.total) {
      throw new DomainError(
        'LAST_ADMINISTRATOR',
        'There must be at least one active Administrator',
      );
    }
  }
}
