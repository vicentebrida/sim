import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { DB, type Database } from '../database/database.module';
import { type Collaborator, installationSettings } from '../database/schema';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get() {
    await this.db.insert(installationSettings).values({ id: 1 }).onConflictDoNothing();
    const [row] = await this.db
      .select()
      .from(installationSettings)
      .where(eq(installationSettings.id, 1));
    return { hiddenAuthorshipEnabled: row!.hiddenAuthorshipEnabled };
  }

  async update(actor: Collaborator, data: { hiddenAuthorshipEnabled?: boolean }) {
    const current = await this.get();
    if (
      data.hiddenAuthorshipEnabled !== undefined &&
      data.hiddenAuthorshipEnabled !== current.hiddenAuthorshipEnabled
    ) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(installationSettings)
          .set({ hiddenAuthorshipEnabled: data.hiddenAuthorshipEnabled })
          .where(eq(installationSettings.id, 1));
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'settings.hidden_authorship_changed',
          targetType: 'settings',
          targetId: 'hidden_authorship',
          details: { enabled: data.hiddenAuthorshipEnabled },
        });
      });
    }
    return this.get();
  }
}
