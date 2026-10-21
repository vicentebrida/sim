import {
  type ExecutionStageDtoOutput,
  getExecutionStagesListQueryKey,
  useExecutionStagesCreate,
  useExecutionStagesDelete,
  useExecutionStagesList,
  useExecutionStagesRename,
  useExecutionStagesReorder,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/errors';
import { useStatusInfo } from '@/lib/use-statuses';

function useReloadStages() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getExecutionStagesListQueryKey() });
}

/** The steps inside In progress (one list for the installation), on the Statuses page. */
export function ExecutionStages() {
  const { t } = useTranslation();
  const statusInfo = useStatusInfo();
  const { data } = useExecutionStagesList();
  const stages = data?.data ?? [];
  const reload = useReloadStages();
  const reorder = useExecutionStagesReorder({ mutation: { onSuccess: reload } });
  const failure = apiErrorMessage(reorder.error, t);

  const swap = (index: number, other: number) => {
    const ids = stages.map(({ id }) => id);
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    reorder.mutate({ data: { ids } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('stages.title', { status: statusInfo.label('in_progress') })}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t('stages.help', { status: statusInfo.label('in_progress') })}
        </p>
        {stages.length > 0 && (
          <ol className="divide-y rounded-lg border" aria-label={t('stages.list')}>
            {stages.map((stage, index) => (
              <li key={stage.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="w-6 text-sm text-muted-foreground">{index + 1}.</span>
                <StageItem stage={stage} />
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('stages.moveUp', { name: stage.name })}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => swap(index, index - 1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('stages.moveDown', { name: stage.name })}
                    disabled={index === stages.length - 1 || reorder.isPending}
                    onClick={() => swap(index, index + 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <NewStage />
      </CardContent>
    </Card>
  );
}

function NewStage() {
  const { t } = useTranslation();
  const reload = useReloadStages();
  const [name, setName] = useState('');
  const create = useExecutionStagesCreate({
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
    <form className="space-y-2" onSubmit={submit}>
      <div className="flex flex-wrap items-end gap-3">
        <FormField
          id="new-stage"
          label={t('stages.new')}
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          <Plus />
          {t('stages.create')}
        </Button>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </form>
  );
}

function StageItem({ stage }: { stage: ExecutionStageDtoOutput }) {
  const { t } = useTranslation();
  const reload = useReloadStages();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const [name, setName] = useState(stage.name);
  const rename = useExecutionStagesRename({
    mutation: {
      onSuccess: async () => {
        setMode('view');
        await reload();
      },
    },
  });
  const remove = useExecutionStagesDelete({ mutation: { onSuccess: reload } });
  const failure = apiErrorMessage(rename.error ?? remove.error, t);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      {mode === 'rename' ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) rename.mutate({ id: stage.id, data: { name: name.trim() } });
          }}
        >
          <Input
            aria-label={t('stages.name')}
            className="max-w-xs"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" type="submit" disabled={rename.isPending || !name.trim()}>
            {t('stages.save')}
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setMode('view')}>
            {t('stages.cancel')}
          </Button>
        </form>
      ) : (
        <>
          <span className="font-medium">{stage.name}</span>
          {mode === 'delete' ? (
            <>
              <span className="text-sm text-muted-foreground">{t('stages.deleteWarning')}</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: stage.id })}
              >
                {t('stages.confirmDelete')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
                {t('stages.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                aria-label={t('stages.renameNamed', { name: stage.name })}
                onClick={() => {
                  setName(stage.name);
                  setMode('rename');
                }}
              >
                <Pencil />
                {t('stages.rename')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('stages.deleteNamed', { name: stage.name })}
                onClick={() => setMode('delete')}
              >
                <Trash2 />
                {t('stages.delete')}
              </Button>
            </>
          )}
        </>
      )}
      {failure && (
        <p role="alert" className="w-full text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}
