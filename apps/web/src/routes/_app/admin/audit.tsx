import { useAuditList } from '@sim/api-client';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/dates';

export const Route = createFileRoute('/_app/admin/audit')({ component: AuditPage });

const PAGE_SIZE = 30;

function AuditPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const { data } = useAuditList({ page, pageSize: PAGE_SIZE });
  const audit = data?.data;
  const pages = audit ? Math.max(1, Math.ceil(audit.total / PAGE_SIZE)) : 1;

  const action = (name: string) =>
    i18n.exists(`audit.actions.${name}`) ? t(`audit.actions.${name}`) : name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>
        <p className="text-muted-foreground">{t('audit.subtitle')}</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('audit.when')}</TableHead>
                <TableHead>{t('audit.who')}</TableHead>
                <TableHead>{t('audit.what')}</TableHead>
                <TableHead>{t('audit.target')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit?.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell>{entry.actor?.name ?? t('audit.system')}</TableCell>
                  <TableCell>{action(entry.action)}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.targetId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {audit && audit.items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('audit.empty')}</p>
          )}
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('audit.previous')}
          </Button>
          <span>{t('audit.page', { page, pages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('audit.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
