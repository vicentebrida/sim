import { useAuthLogout } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AdminMenu } from '@/components/admin-menu';
import { BrandMark } from '@/components/brand';
import { ApiStatus } from '@/components/api-status';
import { NotificationBell } from '@/components/notifications';
import { Button } from '@/components/ui/button';
import { getCurrentCollaborator } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';

/** Layout of the pages that require a session. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const collaborator = await getCurrentCollaborator(context.queryClient);
    if (!collaborator) {
      throw redirect({ to: '/login', search: { returnTo: location.href } });
    }
    if (collaborator.mustChangePassword) throw redirect({ to: '/change-password' });
    return { collaborator };
  },
  component: AppLayout,
});

const NAV_LINK = 'text-muted-foreground [&.active]:text-foreground';

function AppLayout() {
  const { t } = useTranslation();
  const { collaborator } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useRealtime();
  const logout = useAuthLogout({
    mutation: {
      onSettled: async () => {
        queryClient.clear();
        await navigate({ to: '/login' });
      },
    },
  });

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:gap-6">
          <Link to="/" className="flex items-center">
            <BrandMark compact />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className={NAV_LINK}>
              {t('nav.ideas')}
            </Link>
            {collaborator.administrator && <AdminMenu />}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ApiStatus />
            <NotificationBell />
            <span className="hidden text-sm sm:inline">{collaborator.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              aria-label={t('nav.logout')}
            >
              <LogOut />
              <span className="hidden sm:inline">{t('nav.logout')}</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
