import {
  getIntegrationsGetQueryKey,
  useIntegrationsGet,
  useIntegrationsTestSemanticSearch,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/_app/admin/integrations')({ component: IntegrationsPage });

function State({ on }: { on: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={on ? 'secondary' : 'outline'}>
      {on ? t('integrations.configured') : t('integrations.notConfigured')}
    </Badge>
  );
}

function IntegrationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useIntegrationsGet();
  const test = useIntegrationsTestSemanticSearch({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getIntegrationsGetQueryKey() }),
    },
  });
  const integrations = data?.data;
  const result = test.data?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('integrations.title')}</h1>
        <p className="text-muted-foreground">{t('integrations.subtitle')}</p>
      </div>
      {integrations && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <h2>{t('integrations.sso')}</h2>
                <State on={integrations.sso.mode !== 'off'} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {integrations.sso.mode === 'off'
                ? t('integrations.ssoOff')
                : t('integrations.ssoMode', { mode: integrations.sso.mode.toUpperCase() })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <h2>{t('integrations.smtp')}</h2>
                <State on={integrations.smtp.configured} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t('integrations.smtpHelp')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <h2>{t('integrations.storage')}</h2>
                <Badge variant="secondary">
                  {t(`integrations.storageKinds.${integrations.storage.kind}`)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t('integrations.storageHelp')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <h2>{t('integrations.redis')}</h2>
                <State on={integrations.redis.configured} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t('integrations.redisHelp')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <h2>{t('integrations.semantic')}</h2>
                <State on={integrations.semanticSearch.configured} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {integrations.semanticSearch.configured ? (
                <>
                  <p className="text-muted-foreground">
                    {t('integrations.semanticModel', {
                      model: integrations.semanticSearch.model,
                      threshold: integrations.semanticSearch.threshold,
                    })}
                  </p>
                  <p>
                    {t('integrations.semanticIndexed', {
                      indexed: integrations.semanticSearch.indexed,
                      total: integrations.semanticSearch.total,
                    })}
                    {integrations.semanticSearch.pending > 0 &&
                      ` · ${t('integrations.semanticPending', { count: integrations.semanticSearch.pending })}`}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={test.isPending}
                    onClick={() => test.mutate()}
                  >
                    {t('integrations.test')}
                  </Button>
                  {result?.ok && (
                    <p role="status">
                      {t('integrations.testOk', { dimensions: result.dimensions })}
                    </p>
                  )}
                  {result && !result.ok && (
                    <p role="alert" className="text-destructive">
                      {t('integrations.testFailed', { error: result.error })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{t('integrations.semanticOff')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
