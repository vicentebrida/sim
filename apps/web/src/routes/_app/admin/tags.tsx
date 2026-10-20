import {
  getTagsListQueryKey,
  type TagDtoOutput,
  useTagsCreate,
  useTagsDelete,
  useTagsList,
  useTagsRename,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/tags')({ component: TagsPage });

function useReloadTags() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getTagsListQueryKey() });
}

function TagsPage() {
  const { t } = useTranslation();
  const { data } = useTagsList();
  const tags = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('tags.adminTitle')}</h1>
        <p className="text-muted-foreground">{t('tags.subtitle')}</p>
      </div>
      <NewTag />
      {data && tags.length === 0 && (
        <p className="text-center text-muted-foreground">{t('tags.none')}</p>
      )}
      <ul className="divide-y rounded-xl border bg-card">
        {tags.map((tag) => (
          <li key={tag.id} className="p-3">
            <TagItem tag={tag} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewTag() {
  const { t } = useTranslation();
  const reload = useReloadTags();
  const [name, setName] = useState('');
  const create = useTagsCreate({
    mutation: {
      onSuccess: async () => {
        setName('');
        await reload();
      },
    },
  });
  const failure = apiErrorMessage(create.error, t);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate({ data: { name: name.trim() } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('tags.new')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <FormField
            id="new-tag"
            label={t('tags.name')}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            <Plus />
            {t('tags.create')}
          </Button>
        </form>
        {failure && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {failure}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TagItem({ tag }: { tag: TagDtoOutput }) {
  const { t } = useTranslation();
  const reload = useReloadTags();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(tag.name);
  const rename = useTagsRename({
    mutation: {
      onSuccess: async () => {
        setMode('view');
        await reload();
      },
    },
  });
  const remove = useTagsDelete({ mutation: { onSuccess: reload } });
  const failure = apiErrorMessage(rename.error ?? remove.error, t);

  return (
    <div className="space-y-2">
      {mode === 'rename' ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) rename.mutate({ id: tag.id, data: { name: name.trim() } });
          }}
        >
          <Input
            aria-label={t('tags.name')}
            className="max-w-xs"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" type="submit" disabled={rename.isPending || !name.trim()}>
            {t('tags.save')}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setMode('view')}>
            {t('tags.cancel')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{tag.name}</span>
          {mode === 'delete' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('tags.deleteWarning')}</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: tag.id })}
              >
                {t('tags.confirmDelete')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
                {t('tags.cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setName(tag.name);
                  setMode('rename');
                }}
              >
                <Pencil />
                {t('tags.rename')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('delete')}>
                <Trash2 />
                {t('tags.delete')}
              </Button>
            </div>
          )}
        </div>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}
