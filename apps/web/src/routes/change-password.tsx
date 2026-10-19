import { zodResolver } from '@hookform/resolvers/zod';
import { getAuthMeQueryKey, useAuthChangePassword } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { getCurrentCollaborator, MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/change-password')({
  beforeLoad: async ({ context }) => {
    const collaborator = await getCurrentCollaborator(context.queryClient);
    if (!collaborator) throw redirect({ to: '/login' });
    if (!collaborator.mustChangePassword) throw redirect({ to: '/' });
  },
  component: ChangePasswordPage,
});

const changeSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'errors.required' }),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, { error: 'changePassword.minimum' }),
    confirmation: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmation, {
    path: ['confirmation'],
    error: 'changePassword.mismatch',
  });

function ChangePasswordPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({ resolver: zodResolver(changeSchema) });
  const change = useAuthChangePassword({
    mutation: {
      onSuccess: async () => {
        // Remove (not just invalidate): the route guard reads the cache with ensureQueryData.
        queryClient.removeQueries({ queryKey: getAuthMeQueryKey() });
        await navigate({ to: '/' });
      },
    },
  });

  const fieldError = (field: keyof z.infer<typeof changeSchema>) => {
    const message = form.formState.errors[field]?.message;
    return message && t(message, { min: MIN_PASSWORD_LENGTH });
  };
  const failure = apiErrorMessage(change.error, t);

  return (
    <AuthCard title={t('changePassword.title')} description={t('changePassword.description')}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(({ currentPassword, newPassword }) =>
          change.mutate({ data: { currentPassword, newPassword } }),
        )}
      >
        <FormField
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          label={t('changePassword.currentPassword')}
          error={fieldError('currentPassword')}
          {...form.register('currentPassword')}
        />
        <FormField
          id="newPassword"
          type="password"
          autoComplete="new-password"
          label={t('changePassword.newPassword')}
          error={fieldError('newPassword')}
          {...form.register('newPassword')}
        />
        <FormField
          id="confirmation"
          type="password"
          autoComplete="new-password"
          label={t('changePassword.confirmation')}
          error={fieldError('confirmation')}
          {...form.register('confirmation')}
        />
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <Button type="submit" disabled={change.isPending}>
          {t('changePassword.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
