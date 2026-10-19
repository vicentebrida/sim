import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { generateTemporaryPassword, hashPassword } from '../auth/password';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { type Collaborator, collaborators } from '../database/schema';

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

      if (existing) {
        const [updated] = await tx
          .update(collaborators)
          .set({ ...profileData, ...administratorChange })
          .where(eq(collaborators.id, existing.id))
          .returning();
        return updated!;
      }

      const [created] = await tx
        .insert(collaborators)
        .values({ ...profileData, ...administratorChange })
        .returning();
      return created!;
    });
  }
}
