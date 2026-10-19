import {
  type CommentDtoOutput,
  type CommentDtoOutputRepliesItem,
  getCommentsListQueryKey,
  getIdeasDetailQueryKey,
  getIdeasListQueryKey,
  type IdeaDtoOutput,
  useCommentsCreate,
  useCommentsHide,
  useCommentsList,
  useCommentsRemove,
  useCommentsUpdate,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/dates';
import { apiErrorMessage } from '@/lib/errors';
import { segment } from '@/lib/mentions';
import { CommentEditor } from './comment-editor';

type Comment = CommentDtoOutput | CommentDtoOutputRepliesItem;
type HistoryEvent = IdeaDtoOutput['history'][number];

type Item =
  | { type: 'event'; at: string; event: HistoryEvent }
  | { type: 'comment'; at: string; comment: CommentDtoOutput };

function useRefreshDiscussion(number: number) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getCommentsListQueryKey(number) }),
      // Comments change what the Author can do (delete) and the "trending" position.
      queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(number) }),
      queryClient.invalidateQueries({ queryKey: getIdeasListQueryKey() }),
    ]);
}

/** The Idea's Comments and History events, in a single chronological sequence. */
export function Discussion({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const { data } = useCommentsList(idea.number);
  const { hash } = useLocation();
  const refresh = useRefreshDiscussion(idea.number);

  // Notifications link to `#comment-<id>`; Comments load after the page, so scroll once they arrive.
  useEffect(() => {
    if (hash && data) document.getElementById(hash)?.scrollIntoView?.({ block: 'center' });
  }, [hash, data]);
  const create = useCommentsCreate({ mutation: { onSuccess: refresh } });
  const comments = data?.data ?? [];

  const items: Item[] = [
    ...idea.history.map((event) => ({ type: 'event' as const, at: event.createdAt, event })),
    ...comments.map((comment) => ({ type: 'comment' as const, at: comment.createdAt, comment })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="space-y-4" aria-labelledby="discussion">
      <h2 id="discussion" className="text-lg font-semibold">
        {t('comments.title')}
      </h2>
      <ol className="space-y-5">
        {items.map((item) =>
          item.type === 'event' ? (
            <li key={item.event.id} className="border-l-2 pl-4">
              <HistoryEntry event={item.event} />
            </li>
          ) : (
            <li key={item.comment.id}>
              <CommentWithReplies comment={item.comment} idea={idea} />
            </li>
          ),
        )}
      </ol>
      {idea.status !== 'draft' && (
        <CommentEditor
          label={t('comments.new')}
          submitLabel={t('comments.comment')}
          sending={create.isPending}
          error={apiErrorMessage(create.error, t)}
          onSubmit={(text) => create.mutateAsync({ number: idea.number, data: { text } })}
        />
      )}
    </section>
  );
}

function HistoryEntry({ event }: { event: HistoryEvent }) {
  const { t } = useTranslation();
  const name = event.collaborator.name;
  const description =
    event.type === 'category'
      ? t('ideas.changedCategory', { name, from: event.from, to: event.to })
      : event.from
        ? t('ideas.changedStatus', {
            name,
            from: t(`status.${event.from}`),
            to: t(`status.${event.to}`),
          })
        : t('ideas.published', { name });
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="font-medium">{description}</span>{' '}
        <time className="text-muted-foreground" dateTime={event.createdAt}>
          · {formatDateTime(event.createdAt)}
        </time>
      </p>
      {event.justification && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{event.justification}</p>
      )}
    </div>
  );
}

function CommentWithReplies({ comment, idea }: { comment: CommentDtoOutput; idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const [replying, setReplying] = useState(false);
  const refresh = useRefreshDiscussion(idea.number);
  const reply = useCommentsCreate({ mutation: { onSuccess: refresh } });

  return (
    <div className="space-y-3">
      <CommentCard comment={comment} idea={idea} onReply={() => setReplying(true)} />
      {(comment.replies.length > 0 || replying) && (
        <ol className="ml-6 space-y-3 border-l pl-4" aria-label={t('comments.replies')}>
          {comment.replies.map((replyItem) => (
            <li key={replyItem.id}>
              <CommentCard comment={replyItem} idea={idea} />
            </li>
          ))}
          {replying && (
            <li>
              <CommentEditor
                label={t('comments.replyingTo', { name: comment.author.name })}
                submitLabel={t('comments.reply')}
                sending={reply.isPending}
                error={apiErrorMessage(reply.error, t)}
                autoFocus
                onCancel={() => setReplying(false)}
                onSubmit={async (text) => {
                  await reply.mutateAsync({
                    number: idea.number,
                    data: { text, replyToId: comment.id },
                  });
                  setReplying(false);
                }}
              />
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  idea,
  onReply,
}: {
  comment: Comment;
  idea: IdeaDtoOutput;
  onReply?: () => void;
}) {
  const { t } = useTranslation();
  const refresh = useRefreshDiscussion(idea.number);
  const [mode, setMode] = useState<'read' | 'edit' | 'hide' | 'remove'>('read');
  const update = useCommentsUpdate({ mutation: { onSuccess: refresh } });
  const remove = useCommentsRemove({ mutation: { onSuccess: refresh } });
  const { canReply, canEdit, canRemove, canHide } = comment.permissions;

  return (
    <article
      id={`comment-${comment.id}`}
      className="scroll-mt-20 space-y-1"
      aria-label={t('comments.by', { name: comment.author.name })}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{comment.author.name}</span>
        {comment.author.id === idea.author.id && (
          <Badge variant="secondary">{t('comments.ideaAuthor')}</Badge>
        )}
        <time className="text-muted-foreground" dateTime={comment.createdAt}>
          {formatDateTime(comment.createdAt)}
        </time>
        {comment.editedAt && comment.state === 'published' && (
          <span className="text-muted-foreground">· {t('comments.edited')}</span>
        )}
      </p>

      {mode === 'edit' && comment.text !== null ? (
        <CommentEditor
          label={t('comments.edit')}
          submitLabel={t('comments.save')}
          initial={comment.text}
          sending={update.isPending}
          error={apiErrorMessage(update.error, t)}
          autoFocus
          onCancel={() => setMode('read')}
          onSubmit={async (text) => {
            await update.mutateAsync({ id: comment.id, data: { text } });
            setMode('read');
          }}
        />
      ) : (
        <CommentBody comment={comment} />
      )}

      {mode === 'hide' && (
        <HideForm comment={comment} onDone={() => setMode('read')} refresh={refresh} />
      )}

      {mode !== 'edit' && mode !== 'hide' && (
        <div className="flex flex-wrap gap-1">
          {onReply && canReply && (
            <Button variant="ghost" size="sm" onClick={onReply}>
              {t('comments.reply')}
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setMode('edit')}>
              {t('comments.edit')}
            </Button>
          )}
          {canRemove && (
            <Button
              variant={mode === 'remove' ? 'destructive' : 'ghost'}
              size="sm"
              disabled={remove.isPending}
              onClick={() =>
                mode === 'remove' ? remove.mutate({ id: comment.id }) : setMode('remove')
              }
            >
              {mode === 'remove' ? t('comments.confirmRemove') : t('comments.remove')}
            </Button>
          )}
          {canHide && (
            <Button variant="ghost" size="sm" onClick={() => setMode('hide')}>
              {t('comments.hide')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function CommentBody({ comment }: { comment: Comment }) {
  const { t } = useTranslation();
  if (comment.state === 'removed') {
    return <p className="text-sm text-muted-foreground italic">{t('comments.removed')}</p>;
  }
  return (
    <div className="space-y-1">
      {comment.state === 'hidden' && comment.hiding && (
        <p className="text-sm text-muted-foreground italic">
          {t('comments.hidden', { name: comment.hiding.by.name, reason: comment.hiding.reason })}
        </p>
      )}
      {comment.text !== null && (
        <p
          className={
            comment.state === 'hidden'
              ? 'rounded-md bg-muted p-2 text-sm whitespace-pre-wrap text-muted-foreground'
              : 'whitespace-pre-wrap'
          }
        >
          <TextWithMentions text={comment.text} />
        </p>
      )}
      {comment.state === 'hidden' && comment.text !== null && (
        <p className="text-xs text-muted-foreground">{t('comments.hiddenTextVisible')}</p>
      )}
    </div>
  );
}

function TextWithMentions({ text }: { text: string }) {
  return segment(text).map((part, index) =>
    part.type === 'text' ? (
      part.value
    ) : (
      <span key={index} className="font-medium text-primary">
        @{part.name}
      </span>
    ),
  );
}

function HideForm({
  comment,
  onDone,
  refresh,
}: {
  comment: Comment;
  onDone: () => void;
  refresh: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const hide = useCommentsHide({
    mutation: {
      onSuccess: async () => {
        await refresh();
        onDone();
      },
    },
  });
  const fieldId = `reason-${comment.id}`;
  const failure = apiErrorMessage(hide.error, t);

  return (
    <form
      className="grid gap-2 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        hide.mutate({ id: comment.id, data: { reason } });
      }}
    >
      <label htmlFor={fieldId} className="text-sm font-medium">
        {t('comments.reason')}
      </label>
      <Textarea
        id={fieldId}
        rows={2}
        value={reason}
        autoFocus
        onChange={(event) => setReason(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t('comments.reasonHelp')}</p>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={!reason.trim() || hide.isPending}
        >
          {t('comments.confirmHide')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('comments.cancel')}
        </Button>
      </div>
    </form>
  );
}
