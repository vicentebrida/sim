import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

/** SIM settings area: Administrators only. */
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: ({ context }) => {
    if (!context.collaborator.administrator) throw redirect({ to: '/' });
  },
  component: Outlet,
});
