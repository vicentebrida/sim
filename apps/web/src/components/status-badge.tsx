import type { IdeiaDtoOutputStatus } from '@sim/api-client';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const CORES: Record<IdeiaDtoOutputStatus, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  aberta: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  em_analise: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  aprovada: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  em_execucao: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  concluida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  recusada: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  duplicada: 'bg-muted text-muted-foreground',
  arquivada: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status }: { status: IdeiaDtoOutputStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', CORES[status])}
    >
      {t(`status.${status}`)}
    </span>
  );
}
