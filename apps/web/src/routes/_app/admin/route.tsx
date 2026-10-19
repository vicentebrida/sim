import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/** Área de configuração do SIM: só Administradores. */
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: ({ context }) => {
    if (!context.colaborador.administrador) throw redirect({ to: '/' });
  },
  component: Outlet,
});
