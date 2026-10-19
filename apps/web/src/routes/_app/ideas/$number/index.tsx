import {
  ApiError,
  getIdeasDetailQueryKey,
  getIdeasListQueryKey,
  type IdeaDtoOutput,
  type IdeaDtoOutputPermissionsTransitionsItem,
  useCategoriesList,
  useIdeasChangeStatus,
  useIdeasDelete,
  useIdeasDetail,
  useIdeasRevealAuthor,
  useIdeasPublish,
  useIdeasRecategorize,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Discussion } from '@/components/comments/discussion';
import { IdeaVersions } from '@/components/idea-versions';
import { FollowButton } from '@/components/follow-button';
import { Likes } from '@/components/likes';
import { NativeSelect } from '@/components/native-select';
import { AttachmentList } from '@/components/attachments';
import { StalledBadge, StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/dates';
import { apiErrorMessage } from '@/lib/errors';
import { useStatusInfo } from '@/lib/use-statuses';

export const Route = createFileRoute('/_app/ideas/$number/')({ component: IdeaPage });

function useRefreshIdea(number: number) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(number) }),
      queryClient.invalidateQueries({ queryKey: getIdeasListQueryKey() }),
    ]);
  };
}

function IdeaPage() {
  const { t } = useTranslation();
  const number = Number(Route.useParams().number);
  const { data, error } = useIdeasDetail(number, { query: { retry: false } });
  const idea = data?.data;

  if (error instanceof ApiError && error.status === 404) {
    return <p className="text-center text-muted-foreground">{t('ideas.notFound')}</p>;
  }
  if (!idea) return null;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={idea.status} />
          {idea.stalled && <StalledBadge />}
          <span>#{idea.number}</span>
          <span>· {idea.category.name}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">{idea.title}</h1>
          <FollowButton idea={idea} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('ideas.by', { name: idea.author.name })} ·{' '}
          {idea.publishedAt
            ? t('ideas.publishedOn', { date: formatDate(idea.publishedAt) })
            : t('ideas.createdOn', { date: formatDate(idea.createdAt) })}
          {idea.editedAt && ` · ${t('ideas.edited')}`}
        </p>
      </header>

      {idea.originalIdea && (
        <Alert>
          <AlertDescription>
            {t('ideas.duplicateOf')}{' '}
            <Link
              className="font-medium underline"
              to="/ideas/$number"
              params={{ number: String(idea.originalIdea.number) }}
            >
              {t('ideas.seeOriginal', idea.originalIdea)}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <IdeaVersions idea={idea} />

      <HiddenAuthorship idea={idea} />

      <AuthorActions idea={idea} />

      <div className="space-y-5">
        {idea.answers.map((answer) => (
          <section key={answer.fieldId} className="space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground">{answer.label}</h2>
            <p className="whitespace-pre-wrap">{displayValue(answer.value, t)}</p>
          </section>
        ))}
        {idea.attachments.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {t('attachments.title')}
            </h2>
            <AttachmentList attachments={idea.attachments} />
          </section>
        )}
      </div>

      {idea.status !== 'draft' && <Likes idea={idea} />}

      {(idea.permissions.transitions.length > 0 || idea.permissions.canRecategorize) && (
        <ReviewPanel idea={idea} />
      )}

      <Discussion idea={idea} />
    </article>
  );
}

function displayValue(value: IdeaDtoOutput['values'][string], t: (key: string) => string) {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? t('ideas.yes') : t('ideas.no');
  return String(value ?? '');
}

function AuthorActions({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refresh = useRefreshIdea(idea.number);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const publish = useIdeasPublish({ mutation: { onSuccess: refresh } });
  const remove = useIdeasDelete({
    mutation: {
      onSuccess: async () => {
        await refresh();
        await navigate({ to: '/' });
      },
    },
  });
  const { canEdit, canPublish, canDelete } = idea.permissions;
  if (!canEdit && !canPublish && !canDelete) return null;

  const failure = apiErrorMessage(publish.error ?? remove.error, t);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canPublish && (
          <Button
            disabled={publish.isPending}
            onClick={() => publish.mutate({ number: idea.number })}
          >
            <Send />
            {t('ideas.publish')}
          </Button>
        )}
        {canEdit && (
          <Button variant="outline" asChild>
            <Link
              to="/ideas/$number/edit"
              params={{ number: String(idea.number) }}
              search={{ failed: undefined }}
            >
              <Pencil />
              {t('ideas.edit')}
            </Link>
          </Button>
        )}
        {canDelete && (
          <Button
            variant={confirmingDelete ? 'destructive' : 'ghost'}
            disabled={remove.isPending}
            onClick={() =>
              confirmingDelete ? remove.mutate({ number: idea.number }) : setConfirmingDelete(true)
            }
          >
            <Trash2 />
            {confirmingDelete ? t('ideas.confirmDelete') : t('ideas.delete')}
          </Button>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}

function ReviewPanel({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('ideas.review')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-8 md:grid-cols-2">
        {idea.permissions.transitions.length > 0 && <ChangeStatus idea={idea} />}
        {idea.permissions.canRecategorize && <Recategorize idea={idea} />}
      </CardContent>
    </Card>
  );
}

function ChangeStatus({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const statusInfo = useStatusInfo();
  const refresh = useRefreshIdea(idea.number);
  const [to, setTo] = useState<IdeaDtoOutputPermissionsTransitionsItem | ''>('');
  const [justification, setJustification] = useState('');
  const [originalNumber, setOriginalNumber] = useState('');
  const change = useIdeasChangeStatus({
    mutation: {
      onSuccess: async () => {
        setTo('');
        setJustification('');
        setOriginalNumber('');
        await refresh();
      },
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!to || to === 'draft') return;
    change.mutate({
      number: idea.number,
      data: {
        to,
        justification,
        originalIdeaNumber: to === 'duplicate' ? Number(originalNumber) || undefined : undefined,
      },
    });
  }

  const failure = apiErrorMessage(change.error, t);
  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="new-status">{t('ideas.newStatus')}</Label>
        <NativeSelect
          id="new-status"
          value={to}
          onChange={(event) => setTo(event.target.value as typeof to)}
        >
          <option value="">{t('ideas.chooseStatus')}</option>
          {idea.permissions.transitions.map((status) => (
            <option key={status} value={status}>
              {statusInfo.label(status)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {to === 'duplicate' && (
        <div className="grid gap-2">
          <Label htmlFor="original-number">{t('ideas.originalNumber')}</Label>
          <Input
            id="original-number"
            inputMode="numeric"
            value={originalNumber}
            onChange={(event) => setOriginalNumber(event.target.value.replace(/\D/g, ''))}
          />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="status-justification">{t('ideas.justification')}</Label>
        <Textarea
          id="status-justification"
          rows={3}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
        <p className="text-sm text-muted-foreground">{t('ideas.justificationHelp')}</p>
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <Button
        type="submit"
        className="justify-self-start"
        disabled={!to || !justification.trim() || change.isPending}
      >
        {t('ideas.apply')}
      </Button>
    </form>
  );
}

function Recategorize({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const refresh = useRefreshIdea(idea.number);
  const { data } = useCategoriesList();
  const [categoryId, setCategoryId] = useState('');
  const [justification, setJustification] = useState('');
  const recategorize = useIdeasRecategorize({
    mutation: {
      onSuccess: async () => {
        setCategoryId('');
        setJustification('');
        await refresh();
      },
    },
  });
  const others = (data?.data ?? []).filter((category) => category.id !== idea.category.id);
  const failure = apiErrorMessage(recategorize.error, t);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        recategorize.mutate({ number: idea.number, data: { categoryId, justification } });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="new-category">{t('ideas.newCategory')}</Label>
        <NativeSelect
          id="new-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">{t('ideas.chooseCategory')}</option>
          {others.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="category-justification">{t('ideas.justification')}</Label>
        <Textarea
          id="category-justification"
          rows={3}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start"
        disabled={!categoryId || !justification.trim() || recategorize.isPending}
      >
        {t('ideas.recategorize')}
      </Button>
    </form>
  );
}

/** Tells the Author their name is hidden, and lets an Administrator reveal it (audited). */
function HiddenAuthorship({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const { collaborator } = useRouteContext({ from: '/_app' });
  const [asking, setAsking] = useState(false);
  const reveal = useIdeasRevealAuthor();
  if (!idea.hiddenAuthorship) return null;

  const revealed = reveal.data?.data;
  return (
    <Alert>
      <AlertDescription className="space-y-2">
        {idea.author.id === collaborator.id ? (
          <p>{t('authorship.youAreHidden')}</p>
        ) : (
          <p>{t('authorship.hiddenNotice')}</p>
        )}
        {collaborator.administrator && idea.author.id !== collaborator.id && (
          <>
            {revealed && (
              <p className="font-medium">{t('authorship.revealed', { name: revealed.name })}</p>
            )}
            {!revealed && !asking && (
              <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
                {t('authorship.reveal')}
              </Button>
            )}
            {!revealed && asking && (
              <div className="space-y-2">
                <p>{t('authorship.revealWarning')}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={reveal.isPending}
                    onClick={() => reveal.mutate({ number: idea.number })}
                  >
                    {t('authorship.revealConfirm')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                    {t('authorship.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}
