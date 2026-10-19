import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../common/domain-error';
import { DB, type Database } from '../database/database.module';
import { statusSettings } from '../database/schema';
import { OPTIONAL_STATUSES, type Status, STATUSES } from '../ideas/domain/idea';

const isOptional = (status: Status) => (OPTIONAL_STATUSES as readonly Status[]).includes(status);

@Injectable()
export class StatusesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Every Status, with the Administrator's customization over the defaults. */
  async list() {
    const rows = new Map(
      (await this.db.select().from(statusSettings)).map((row) => [row.status, row]),
    );
    return STATUSES.map((status) => {
      const row = rows.get(status);
      return {
        status,
        label: row?.label ?? null,
        color: row?.color ?? null,
        description: row?.description ?? '',
        enabled: row?.enabled ?? true,
        optional: isOptional(status),
      };
    });
  }

  async disabled(): Promise<Status[]> {
    return (await this.list()).filter((entry) => !entry.enabled).map((entry) => entry.status);
  }

  async update(
    status: Status,
    data: { label?: string | null; color?: string | null; description?: string; enabled?: boolean },
  ) {
    if (data.enabled === false && !isOptional(status)) {
      throw new DomainError('STATUS_NOT_OPTIONAL', 'This Status cannot be turned off');
    }
    await this.db
      .insert(statusSettings)
      .values({ status, ...data })
      .onConflictDoUpdate({ target: statusSettings.status, set: data });
    return (await this.list()).find((entry) => entry.status === status)!;
  }
}
