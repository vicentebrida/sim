import { useHealthCheck } from '@sim/api-client';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

export function ApiStatus() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useHealthCheck({ query: { retry: false } });

  if (isPending) return <Badge variant="outline">{t('apiStatus.checking')}</Badge>;
  if (isError) return <Badge variant="destructive">{t('apiStatus.offline')}</Badge>;
  return data.data.status === 'ok' ? (
    <Badge variant="secondary">{t('apiStatus.ok')}</Badge>
  ) : (
    <Badge variant="destructive">{t('apiStatus.degraded')}</Badge>
  );
}
