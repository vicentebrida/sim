import { type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../database/database.module';
import { customFields, ideas } from '../database/schema';

/**
 * Refreshes `ideas.detection_text` from the values of the active Custom Fields marked for
 * detection. Without `where`, refreshes every Idea (used when the field configuration changes).
 */
export async function refreshDetectionText(executor: Executor, where?: SQL) {
  await executor.execute(sql`
    update ${ideas} set detection_text = coalesce((
      select string_agg(${ideas.values} ->> ${customFields.id}::text, ' ' order by ${customFields.position})
      from ${customFields}
      where ${customFields.useForDetection} and ${customFields.active}
        and jsonb_typeof(${ideas.values} -> ${customFields.id}::text) = 'string'
    ), '')
    ${where ? sql`where ${where}` : sql``}`);
}
