import type { IdeaDtoOutputStatus } from '@sim/api-client';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const COLORS: Record<IdeaDtoOutputStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  under_review: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  approved: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  declined: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  duplicate: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status }: { status: IdeaDtoOutputStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', COLORS[status])}
    >
      {t(`status.${status}`)}
    </span>
  );
}
