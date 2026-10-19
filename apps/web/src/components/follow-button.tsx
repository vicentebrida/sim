import {
  getIdeasDetailQueryKey,
  getIdeasListQueryKey,
  type IdeaDtoOutput,
  useIdeasFollow,
  useIdeasUnfollow,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Follow or unfollow the Idea (liking, commenting and creating already follow it). */
export function FollowButton({ idea }: { idea: IdeaDtoOutput }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(idea.number) }),
      queryClient.invalidateQueries({ queryKey: getIdeasListQueryKey() }),
    ]);
  const follow = useIdeasFollow({ mutation: { onSuccess: refresh } });
  const unfollow = useIdeasUnfollow({ mutation: { onSuccess: refresh } });

  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={idea.following}
      title={t('follow.help')}
      disabled={follow.isPending || unfollow.isPending}
      onClick={() =>
        idea.following
          ? unfollow.mutate({ number: idea.number })
          : follow.mutate({ number: idea.number })
      }
    >
      {idea.following ? <BellOff /> : <Bell />}
      {idea.following ? t('follow.following') : t('follow.follow')}
    </Button>
  );
}
