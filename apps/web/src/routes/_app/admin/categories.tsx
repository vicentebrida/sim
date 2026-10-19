import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CategoryDtoOutput,
  getCategoriesListQueryKey,
  useCategoriesCreate,
  useCategoriesList,
  useCategoriesSetReviewers,
  useCategoriesUpdate,
  useCollaboratorsList,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Power, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/categories')({ component: CategoriesPage });

const PARAMS = { includeInactive: 'true' };

const categorySchema = z.object({
  name: z.string().trim().min(1, { error: 'errors.required' }).max(60),
  description: z.string().trim().max(280),
});
type CategoryData = z.infer<typeof categorySchema>;

function useReloadCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getCategoriesListQueryKey() });
}

function CategoriesPage() {
  const { t } = useTranslation();
  const { data } = useCategoriesList(PARAMS);
  const categories = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('categories.title')}</h1>
        <p className="text-muted-foreground">{t('categories.subtitle')}</p>
      </div>
      <NewCategory />
      {data && categories.length === 0 && (
        <p className="text-center text-muted-foreground">{t('categories.none')}</p>
      )}
      <ul className="space-y-4">
        {categories.map((category) => (
          <li key={category.id}>
            <CategoryItem category={category} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryFields({
  form,
  prefix,
}: {
  form: ReturnType<typeof useForm<CategoryData>>;
  prefix: string;
}) {
  const { t } = useTranslation();
  const nameError = form.formState.errors.name?.message;
  return (
    <>
      <FormField
        id={`${prefix}-name`}
        label={t('categories.name')}
        error={nameError && t(nameError)}
        {...form.register('name')}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-description`}>{t('categories.description')}</Label>
        <Textarea id={`${prefix}-description`} rows={2} {...form.register('description')} />
        <p className="text-sm text-muted-foreground">{t('categories.descriptionHelp')}</p>
      </div>
    </>
  );
}

function NewCategory() {
  const { t } = useTranslation();
  const reload = useReloadCategories();
  const form = useForm<CategoryData>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  });
  const create = useCategoriesCreate({
    mutation: {
      onSuccess: async () => {
        form.reset();
        await reload();
      },
    },
  });
  const failure = apiErrorMessage(create.error, t);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('categories.new')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((data) => create.mutate({ data }))}
        >
          <CategoryFields form={form} prefix="new" />
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          <Button type="submit" className="justify-self-start" disabled={create.isPending}>
            <Plus />
            {t('categories.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type Mode = 'view' | 'edit' | 'reviewers';

function CategoryItem({ category }: { category: CategoryDtoOutput }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('view');
  const reload = useReloadCategories();
  const toggleActive = useCategoriesUpdate({ mutation: { onSuccess: reload } });

  return (
    <Card className={category.active ? undefined : 'opacity-70'}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {category.name}
              {!category.active && <Badge variant="outline">{t('categories.inactive')}</Badge>}
            </h2>
            {category.description && (
              <p className="text-sm text-muted-foreground">{category.description}</p>
            )}
          </div>
          {mode === 'view' && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setMode('edit')}>
                <Pencil />
                {t('categories.edit')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMode('reviewers')}>
                <Users />
                {t('categories.reviewers')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={toggleActive.isPending}
                onClick={() =>
                  toggleActive.mutate({ id: category.id, data: { active: !category.active } })
                }
              >
                <Power />
                {category.active ? t('categories.deactivate') : t('categories.reactivate')}
              </Button>
            </div>
          )}
        </div>

        {mode === 'edit' && <EditCategory category={category} onClose={() => setMode('view')} />}
        {mode === 'reviewers' && (
          <ChooseReviewers category={category} onClose={() => setMode('view')} />
        )}
        {mode !== 'reviewers' && (
          <div className="text-sm">
            <span className="font-medium">{t('categories.reviewers')}: </span>
            {category.reviewers.length ? (
              category.reviewers.map((reviewer) => reviewer.name).join(', ')
            ) : (
              <span className="text-muted-foreground">{t('categories.noReviewers')}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditCategory({ category, onClose }: { category: CategoryDtoOutput; onClose: () => void }) {
  const { t } = useTranslation();
  const reload = useReloadCategories();
  const form = useForm<CategoryData>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category.name, description: category.description },
  });
  const update = useCategoriesUpdate({
    mutation: {
      onSuccess: async () => {
        await reload();
        onClose();
      },
    },
  });
  const failure = apiErrorMessage(update.error, t);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit((data) => update.mutate({ id: category.id, data }))}
    >
      <CategoryFields form={form} prefix={category.id} />
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending}>
          {t('categories.save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('categories.cancel')}
        </Button>
      </div>
    </form>
  );
}

function ChooseReviewers({
  category,
  onClose,
}: {
  category: CategoryDtoOutput;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reload = useReloadCategories();
  const { data } = useCollaboratorsList();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(
    () => new Set(category.reviewers.map((reviewer) => reviewer.id)),
  );
  const setReviewers = useCategoriesSetReviewers({
    mutation: {
      onSuccess: async () => {
        await reload();
        onClose();
      },
    },
  });

  const term = search.trim().toLowerCase();
  const candidates = (data?.data ?? []).filter(
    (collaborator) =>
      collaborator.active &&
      (!term ||
        collaborator.name.toLowerCase().includes(term) ||
        collaborator.email.includes(term)),
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const failure = apiErrorMessage(setReviewers.error, t);
  return (
    <div className="grid gap-3">
      <Input
        aria-label={t('categories.searchCollaborator')}
        placeholder={t('categories.searchCollaborator')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <fieldset className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
        <legend className="sr-only">{t('categories.reviewers')}</legend>
        {candidates.map((collaborator) => (
          <label
            key={collaborator.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
          >
            <input
              type="checkbox"
              className="size-4"
              checked={selected.has(collaborator.id)}
              onChange={() => toggle(collaborator.id)}
            />
            <span>{collaborator.name}</span>
            <span className="text-muted-foreground">{collaborator.email}</span>
          </label>
        ))}
      </fieldset>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={setReviewers.isPending}
          onClick={() =>
            setReviewers.mutate({ id: category.id, data: { collaboratorIds: [...selected] } })
          }
        >
          {t('categories.save')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('categories.cancel')}
        </Button>
      </div>
    </div>
  );
}
