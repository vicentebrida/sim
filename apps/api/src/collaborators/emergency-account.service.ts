import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../auth/password';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { collaborators } from '../database/schema';

/**
 * Emergency account: the installation's first Administrator, and guaranteed access even when SSO
 * is down. Its password always comes from the environment, never from the screens.
 */
@Injectable()
export class EmergencyAccountService {
  private readonly logger = new Logger(EmergencyAccountService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  isEmergencyAccount(email: string) {
    return this.env.SIM_EMERGENCY_EMAIL === email;
  }

  async ensure() {
    const email = this.env.SIM_EMERGENCY_EMAIL;
    const password = this.env.SIM_EMERGENCY_PASSWORD;
    if (!email || !password) return;

    const [existing] = await this.db
      .select()
      .from(collaborators)
      .where(eq(collaborators.email, email));

    if (!existing) {
      await this.db.insert(collaborators).values({
        name: 'Administrador',
        email,
        passwordHash: await hashPassword(password),
        administrator: true,
      });
      this.logger.log(`Emergency account created: ${email}`);
      return;
    }

    const passwordChanged = !(await verifyPassword(existing.passwordHash, password));
    await this.db
      .update(collaborators)
      .set({
        administrator: true,
        active: true,
        mustChangePassword: false,
        ...(passwordChanged ? { passwordHash: await hashPassword(password) } : {}),
      })
      .where(eq(collaborators.id, existing.id));
  }
}
