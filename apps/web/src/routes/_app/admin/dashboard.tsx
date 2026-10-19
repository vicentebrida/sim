import {
  getDashboardExportUrl,
  type IdeaDtoOutputStatus,
  useDashboardOverview,
} from '@sim/api-client';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/_app/admin/dashboard')({ component: DashboardPage });

const STATUS_ORDER: IdeaDtoOutputStatus[] = [
  'open',
  'under_review',
  'approved',
  'in_progress',
  'done',
  'declined',
  'duplicate',
  'archived',
];

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function IdeaLine({
  idea,
  detail,
}: {
  idea: { number: number; title: string; status: IdeaDtoOutputStatus; category: string };
  detail: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <StatusBadge status={idea.status} />
      <Link
        to="/ideas/$number"
        params={{ number: String(idea.number) }}
        className="font-medium hover:underline"
      >
        #{idea.number} {idea.title}
      </Link>
      <span className="text-muted-foreground">· {idea.category}</span>
      <span className="ml-auto text-muted-foreground">{detail}</span>
    </li>
  );
}

function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { data } = useDashboardOverview();
  const dashboard = data?.data;
  const numbers = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });

  const average = (hours: number | null) =>
    hours === null
      ? t('dashboard.noDecisions')
      : hours >= 48
        ? t('dashboard.days', { value: numbers.format(hours / 24) })
        : t('dashboard.hours', { value: numbers.format(hours) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button asChild variant="outline">
          <a href={getDashboardExportUrl()} download>
            <Download />
            {t('dashboard.export')}
          </a>
        </Button>
      </div>

      {dashboard && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={t('dashboard.byStatus')}>
            <dl className="grid gap-1 text-sm">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex items-center justify-between">
                  <dt>
                    <StatusBadge status={status} />
                  </dt>
                  <dd className="font-medium">
                    {dashboard.byStatus.find((entry) => entry.status === status)?.total ?? 0}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title={t('dashboard.byCategory')}>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="font-normal">{t('dashboard.category')}</th>
                  <th className="text-right font-normal">{t('dashboard.total')}</th>
                  <th className="text-right font-normal">{t('dashboard.undecided')}</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byCategory.map((category) => (
                  <tr key={category.id}>
                    <td className="py-1">{category.name}</td>
                    <td className="text-right">{category.total}</td>
                    <td className="text-right">{category.undecided}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title={t('dashboard.firstDecision')}>
            <p className="text-3xl font-semibold">
              {average(dashboard.firstDecision.averageHours)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('dashboard.decided', { count: dashboard.firstDecision.decided })}
            </p>
          </Panel>

          <Panel title={t('dashboard.stalled')}>
            {dashboard.stalled.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dashboard.noStalled')}</p>
            ) : (
              <ul className="divide-y">
                {dashboard.stalled.map((idea) => (
                  <IdeaLine
                    key={idea.number}
                    idea={idea}
                    detail={t('dashboard.stalledDays', { count: idea.days })}
                  />
                ))}
              </ul>
            )}
          </Panel>

          <div className="lg:col-span-2">
            <Panel title={t('dashboard.mostLiked')}>
              {dashboard.mostLikedUndecided.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dashboard.noneUndecided')}</p>
              ) : (
                <ul className="divide-y">
                  {dashboard.mostLikedUndecided.map((idea) => (
                    <IdeaLine
                      key={idea.number}
                      idea={idea}
                      detail={t('likes.total', { count: idea.likes })}
                    />
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
