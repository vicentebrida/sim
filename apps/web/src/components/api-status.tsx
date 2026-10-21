import { useHealthCheck } from '@sim/api-client';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

/** Says so when the server is unavailable or degraded; nothing while it is fine. */
export function ApiStatus() {
  const { t } = useTranslation();
  const { data, isError } = useHealthCheck({ query: { retry: false } });

  if (isError) return <Badge variant="destructive">{t('apiStatus.offline')}</Badge>;
  if (data && data.data.status !== 'ok') {
    return <Badge variant="destructive">{t('apiStatus.degraded')}</Badge>;
  }
  return null;
}
