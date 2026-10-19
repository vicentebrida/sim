import { useAuthLogout } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiStatus } from '@/components/api-status';
import { Button } from '@/components/ui/button';
import { obterColaboradorAtual } from '@/lib/auth';

/** Layout das páginas que exigem sessão. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const colaborador = await obterColaboradorAtual(context.queryClient);
    if (!colaborador) {
      throw redirect({ to: '/entrar', search: { retorno: location.href } });
    }
    if (colaborador.deveTrocarSenha) throw redirect({ to: '/trocar-senha' });
    return { colaborador };
  },
  component: AppLayout,
});

function AppLayout() {
  const { t } = useTranslation();
  const { colaborador } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useAuthLogout({
    mutation: {
      onSettled: async () => {
        queryClient.clear();
        await navigate({ to: '/entrar' });
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
            <Link to="/" className="text-muted-foreground [&.active]:text-foreground">
              {t('nav.ideas')}
            </Link>
            {colaborador.administrador && (
              <>
                <Link
                  to="/admin/categorias"
                  className="text-muted-foreground [&.active]:text-foreground"
                >
                  {t('nav.categorias')}
                </Link>
                <Link
                  to="/admin/campos"
                  className="text-muted-foreground [&.active]:text-foreground"
                >
                  {t('nav.campos')}
                </Link>
                <Link
                  to="/admin/colaboradores"
                  className="text-muted-foreground [&.active]:text-foreground"
                >
                  {t('nav.colaboradores')}
                </Link>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ApiStatus />
            <span className="hidden text-sm sm:inline">{colaborador.nome}</span>
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
