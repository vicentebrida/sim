import { useStatusesList } from '@sim/api-client';
import { useTranslation } from 'react-i18next';

/** Name, color and description of each Status, with the Administrator's changes over the defaults. */
export function useStatusInfo() {
  const { t } = useTranslation();
  const { data } = useStatusesList({ query: { staleTime: 5 * 60_000 } });
  const settings = new Map((data?.data ?? []).map((entry) => [entry.status, entry]));
  return {
    label: (status: string) => settings.get(status as never)?.label ?? t(`status.${status}`),
    color: (status: string) => settings.get(status as never)?.color ?? null,
    description: (status: string) => settings.get(status as never)?.description || undefined,
    // On while the settings load; the API refuses what is off anyway.
    enabled: (status: string) => settings.get(status as never)?.enabled ?? true,
  };
}
