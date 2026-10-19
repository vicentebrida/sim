import { zodResolver } from '@hookform/resolvers/zod';
import { getAuthMeQueryKey, useAuthConfiguration, useAuthLogin } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getCurrentCollaborator, safeReturnTo } from '@/lib/auth';
import { apiErrorMessage } from '@/lib/errors';

const searchSchema = z.object({
  returnTo: z.string().optional().catch(undefined),
  error: z.enum(['sso', 'inactive']).optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, search }) => {
    if (await getCurrentCollaborator(context.queryClient)) {
      throw redirect({ href: safeReturnTo(search.returnTo) });
    }
  },
  component: LoginPage,
});

const credentialsSchema = z.object({
  email: z.email({ error: 'errors.invalidEmail' }),
  password: z.string().min(1, { error: 'errors.required' }),
});

function LoginPage() {
  const { t } = useTranslation();
  const translate = (key?: string) => (key ? t(key) : undefined);
  const { returnTo, error } = Route.useSearch();
  const destination = safeReturnTo(returnTo);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: configuration } = useAuthConfiguration();
  const form = useForm({ resolver: zodResolver(credentialsSchema) });
  const login = useAuthLogin({
    mutation: {
      onSuccess: async () => {
        queryClient.removeQueries({ queryKey: getAuthMeQueryKey() });
        await navigate({ href: destination });
      },
    },
  });

  const loginFailure = apiErrorMessage(login.error, t);
  const sso = configuration?.data.sso;

  return (
    <AuthCard title={t('login.title')}>
      <div className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t(`login.errors.${error}`)}</AlertDescription>
          </Alert>
        )}
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((data) => login.mutate({ data }))}
        >
          <FormField
            id="email"
            type="email"
            autoComplete="username"
            label={t('login.email')}
            error={translate(form.formState.errors.email?.message)}
            {...form.register('email')}
          />
          <FormField
            id="password"
            type="password"
            autoComplete="current-password"
            label={t('login.password')}
            error={translate(form.formState.errors.password?.message)}
            {...form.register('password')}
          />
          {loginFailure && (
            <p role="alert" className="text-sm text-destructive">
              {loginFailure}
            </p>
          )}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
        {sso?.enabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t('login.or')}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" asChild>
              {/* Full navigation: SSO redirects to the identity provider. */}
              <a href={`/api/auth/sso/start?returnTo=${encodeURIComponent(destination)}`}>
                {sso.label ?? t('login.ssoDefault')}
              </a>
            </Button>
          </>
        )}
      </div>
    </AuthCard>
  );
}
