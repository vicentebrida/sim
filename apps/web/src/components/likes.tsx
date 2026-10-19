import {
  getIdeasDetailQueryKey,
  getIdeasListLikesQueryKey,
  getIdeasListQueryKey,
  type IdeaDtoOutput,
  useIdeasLike,
  useIdeasListLikes,
  useIdeasUnlike,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Like counter on the list; highlighted when the current Collaborator liked it. */
export function LikeCount({ total, liked }: { total: number; liked: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm',
        liked ? 'font-medium text-primary' : 'text-muted-foreground',
      )}
      title={liked ? t('likes.youLiked') : undefined}
    >
      <ThumbsUp className={cn('size-4', liked && 'fill-current')} aria-hidden />
      {t('likes.total', { count: total })}
    </span>
  );
}

/** Like button on the Idea page, with the list of who liked. */
export function Likes({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const { collaborator } = useRouteContext({ from: '/_app' });
  const queryClient = useQueryClient();
  const [showingWho, setShowingWho] = useState(false);
  const { total, liked } = idea.likes;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(idea.number) }),
      queryClient.invalidateQueries({ queryKey: getIdeasListQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getIdeasListLikesQueryKey(idea.number) }),
    ]);
  };
  const like = useIdeasLike({ mutation: { onSuccess: refresh } });
  const unlike = useIdeasUnlike({ mutation: { onSuccess: refresh } });
  const sending = like.isPending || unlike.isPending;

  const reason = idea.author.id === collaborator.id ? t('likes.ownIdea') : t('likes.frozen');

  return (
    <section className="space-y-2" aria-label={t('likes.total', { count: total })}>
      <div className="flex flex-wrap items-center gap-3">
        {idea.permissions.canLike ? (
          <Button
            variant={liked ? 'default' : 'outline'}
            aria-pressed={liked}
            disabled={sending}
            title={t('likes.likeHelp')}
            onClick={() =>
              liked ? unlike.mutate({ number: idea.number }) : like.mutate({ number: idea.number })
            }
          >
            <ThumbsUp className={cn(liked && 'fill-current')} />
            {liked ? t('likes.liked') : t('likes.like')}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{reason}</p>
        )}
        <LikeCount total={total} liked={liked} />
        {total > 0 && (
          <Button
            variant="link"
            size="sm"
            className="px-0"
            aria-expanded={showingWho}
            onClick={() => setShowingWho((current) => !current)}
          >
            {showingWho ? t('likes.hideWho') : t('likes.seeWho')}
          </Button>
        )}
      </div>
      {showingWho && <WhoLiked number={idea.number} />}
    </section>
  );
}

function WhoLiked({ number }: { number: number }) {
  const { t } = useTranslation();
  const { data } = useIdeasListLikes(number);
  const likes = data?.data;
  if (!likes) return null;
  if (!likes.length) return <p className="text-sm text-muted-foreground">{t('likes.nobody')}</p>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('likes.seeWho')}>
      {likes.map(({ collaborator }) => (
        <li key={collaborator.id} className="rounded-full bg-muted px-3 py-1 text-sm">
          {collaborator.name}
        </li>
      ))}
    </ul>
  );
}
