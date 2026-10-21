import { Inject, Injectable } from '@nestjs/common';
import { eq, isNotNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { type Collaborator, ideas, installationSettings } from '../database/schema';

export interface StalledSettings {
  openDays: number;
  reviewDays: number;
  escalationDays: number;
}

type StalledChange = {
  [K in keyof StalledSettings]?: number | null;
};

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  async get() {
    await this.db.insert(installationSettings).values({ id: 1 }).onConflictDoNothing();
    const [row] = await this.db
      .select()
      .from(installationSettings)
      .where(eq(installationSettings.id, 1));
    return {
      hiddenAuthorshipEnabled: row!.hiddenAuthorshipEnabled,
      // What is in force: the Administrator's choice, or else the environment default.
      stalled: {
        openDays: row!.stalledOpenDays ?? this.env.SIM_STALLED_OPEN_DAYS,
        reviewDays: row!.stalledReviewDays ?? this.env.SIM_STALLED_REVIEW_DAYS,
        escalationDays: row!.stalledEscalationDays ?? this.env.SIM_STALLED_ESCALATION_DAYS,
      } satisfies StalledSettings,
      // Days without Likes, Comments or edits before an Open Idea is archived; null is off.
      autoArchive: { days: row!.autoArchiveDays },
    };
  }

  async update(
    actor: Collaborator,
    data: {
      hiddenAuthorshipEnabled?: boolean;
      stalled?: StalledChange;
      autoArchive?: { days: number | null };
    },
  ) {
    const current = await this.get();
    const authorship =
      data.hiddenAuthorshipEnabled !== undefined &&
      data.hiddenAuthorshipEnabled !== current.hiddenAuthorshipEnabled;
    const stalled = data.stalled && Object.keys(data.stalled).length > 0;
    const autoArchive =
      data.autoArchive !== undefined && data.autoArchive.days !== current.autoArchive.days;
    if (!authorship && !stalled && !autoArchive) return current;

    await this.db.transaction(async (tx) => {
      if (authorship) {
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
      }
      if (stalled) {
        const change = data.stalled!;
        await tx
          .update(installationSettings)
          .set({
            ...(change.openDays !== undefined && { stalledOpenDays: change.openDays }),
            ...(change.reviewDays !== undefined && { stalledReviewDays: change.reviewDays }),
            ...(change.escalationDays !== undefined && {
              stalledEscalationDays: change.escalationDays,
            }),
          })
          .where(eq(installationSettings.id, 1));
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'settings.stalled_deadlines_changed',
          targetType: 'settings',
          targetId: 'stalled_deadlines',
          details: { ...change },
        });
      }
      if (autoArchive) {
        const days = data.autoArchive!.days;
        await tx
          .update(installationSettings)
          .set({ autoArchiveDays: days })
          .where(eq(installationSettings.id, 1));
        // Warnings given under the old rule no longer hold: every Author is told again.
        await tx
          .update(ideas)
          .set({ archiveWarnedAt: null })
          .where(isNotNull(ideas.archiveWarnedAt));
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'settings.auto_archive_changed',
          targetType: 'settings',
          targetId: 'auto_archive',
          details: { days },
        });
      }
    });
    return this.get();
  }
}
