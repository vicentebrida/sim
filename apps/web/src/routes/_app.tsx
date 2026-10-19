import { useAuthLogout } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiStatus } from '@/components/api-status';
import { NotificationBell } from '@/components/notifications';
import { Button } from '@/components/ui/button';
import { getCurrentCollaborator } from '@/lib/auth';

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
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-primary">{t('app.name')}</span>
            <span className="hidden text-sm text-muted-foreground md:inline">
              {t('app.fullName')}
            </span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className={NAV_LINK}>
              {t('nav.ideas')}
            </Link>
            {collaborator.administrator && (
              <>
                <Link to="/admin/dashboard" className={NAV_LINK}>
                  {t('nav.dashboard')}
                </Link>
                <Link to="/admin/categories" className={NAV_LINK}>
                  {t('nav.categories')}
                </Link>
                <Link to="/admin/custom-fields" className={NAV_LINK}>
                  {t('nav.fields')}
                </Link>
                <Link to="/admin/collaborators" className={NAV_LINK}>
                  {t('nav.collaborators')}
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ApiStatus />
            <NotificationBell />
            <span className="hidden text-sm sm:inline">{collaborator.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut />
              {t('nav.logout')}
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
