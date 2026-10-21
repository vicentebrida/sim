import { useCategoriesList, useIdeasList, useTagsList } from '@sim/api-client';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { LikeCount } from '@/components/likes';
import { NativeSelect } from '@/components/native-select';
import { TagList } from '@/components/tags';
import { StalledBadge, StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/dates';
import { useStatusInfo } from '@/lib/use-statuses';
import { useText } from '@/lib/use-text';
import { RecentlyCompleted } from '@/components/recognition';

const FILTERABLE_STATUSES = [
  'open',
  'under_review',
  'approved',
  'in_progress',
  'done',
  'declined',
  'duplicate',
  'archived',
] as const;

const SORT_ORDERS = ['trending', 'most_liked', 'newest'] as const;

const filtersSchema = z.object({
  status: z.enum(FILTERABLE_STATUSES).optional().catch(undefined),
  categoryId: z.string().optional().catch(undefined),
  tagId: z.string().optional().catch(undefined),
  mine: z.boolean().optional().catch(undefined),
  following: z.boolean().optional().catch(undefined),
  // Missing from the URL means "trending", the default order.
  sort: z.enum(SORT_ORDERS).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/')({
  validateSearch: filtersSchema,
  component: HomePage,
});

const PAGE_SIZE = 20;

function HomePage() {
  const { t } = useTranslation();
  const text = useText();
  const statusInfo = useStatusInfo();
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const page = filters.page ?? 1;
  const { data: categoriesResponse } = useCategoriesList();
  const { data: tagsResponse } = useTagsList({ query: { staleTime: 60_000 } });
  const tags = tagsResponse?.data ?? [];
  const { data } = useIdeasList({
    status: filters.status,
    categoryId: filters.categoryId,
    tagId: filters.tagId,
    author: filters.mine ? 'me' : undefined,
    following: filters.following ? 'true' : undefined,
    sort: filters.sort,
    page,
    pageSize: PAGE_SIZE,
  });
  const result = data?.data;
  const pageCount = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  const filter = (change: Partial<z.infer<typeof filtersSchema>>) =>
    navigate({ search: (current) => ({ ...current, ...change, page: undefined }) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{text('homeTitle')}</h1>
          <p className="text-muted-foreground">{text('homeSubtitle')}</p>
        </div>
        <Button asChild>
          <Link to="/ideas/new">
            <Lightbulb />
            {text('newIdeaButton')}
          </Link>
        </Button>
      </div>

      <RecentlyCompleted />

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-44 gap-1">
          <Label htmlFor="filter-status">{t('ideas.filters.status')}</Label>
          <NativeSelect
            id="filter-status"
            value={filters.status ?? ''}
            onChange={(event) =>
              filter({ status: (event.target.value || undefined) as typeof filters.status })
            }
          >
            <option value="">{t('ideas.filters.all')}</option>
            {FILTERABLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusInfo.label(status)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid min-w-44 gap-1">
          <Label htmlFor="filter-category">{t('ideas.filters.category')}</Label>
          <NativeSelect
            id="filter-category"
            value={filters.categoryId ?? ''}
            onChange={(event) => filter({ categoryId: event.target.value || undefined })}
          >
            <option value="">{t('ideas.filters.allCategories')}</option>
            {(categoriesResponse?.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {tags.length > 0 && (
          <div className="grid min-w-44 gap-1">
            <Label htmlFor="filter-tag">{t('ideas.filters.tag')}</Label>
            <NativeSelect
              id="filter-tag"
              value={filters.tagId ?? ''}
              onChange={(event) => filter({ tagId: event.target.value || undefined })}
            >
              <option value="">{t('ideas.filters.allTags')}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid min-w-44 gap-1">
          <Label htmlFor="filter-sort">{t('ideas.sort.label')}</Label>
          <NativeSelect
            id="filter-sort"
            value={filters.sort ?? 'trending'}
            onChange={(event) => {
              const sort = event.target.value as (typeof SORT_ORDERS)[number];
              filter({ sort: sort === 'trending' ? undefined : sort });
            }}
          >
            {SORT_ORDERS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`ideas.sort.${sort}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={Boolean(filters.mine)}
            onChange={(event) => filter({ mine: event.target.checked || undefined })}
          />
          {t('ideas.filters.mine')}
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={Boolean(filters.following)}
            onChange={(event) => filter({ following: event.target.checked || undefined })}
          />
          {t('ideas.filters.following')}
        </label>
      </div>

      {result && result.items.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('ideas.empty')}
          </CardContent>
        </Card>
      )}

      <ul className="space-y-3">
        {result?.items.map((idea) => (
          <li key={idea.id}>
            <Link
              to="/ideas/$number"
              params={{ number: String(idea.number) }}
              className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={idea.status} stage={idea.stage} />
                {idea.stalled && <StalledBadge />}
                <span className="text-sm text-muted-foreground">#{idea.number}</span>
                <span className="text-sm text-muted-foreground">· {idea.category.name}</span>
              </div>
              <h2 className="mt-2 font-medium">{idea.title}</h2>
              <TagList tags={idea.tags} className="mt-2" />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {t('ideas.by', { name: idea.author.name })} ·{' '}
                  {idea.publishedAt
                    ? t('ideas.publishedOn', { date: formatDate(idea.publishedAt) })
                    : t('ideas.createdOn', { date: formatDate(idea.createdAt) })}
                </p>
                {idea.status !== 'draft' && <LikeCount {...idea.likes} />}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {result && pageCount > 1 && (
        <nav className="flex items-center justify-center gap-4" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => navigate({ search: (current) => ({ ...current, page: page - 1 }) })}
          >
            {t('ideas.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('ideas.page', { page, total: pageCount })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => navigate({ search: (current) => ({ ...current, page: page + 1 }) })}
          >
            {t('ideas.next')}
          </Button>
        </nav>
      )}
    </div>
  );
}
