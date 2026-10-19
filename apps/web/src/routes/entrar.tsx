import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, getAuthMeQueryKey, useAuthConfiguracao, useAuthLogin } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { obterColaboradorAtual, retornoSeguro } from '@/lib/auth';

const searchSchema = z.object({
  retorno: z.string().optional().catch(undefined),
  erro: z.enum(['sso', 'inativo']).optional().catch(undefined),
});

export const Route = createFileRoute('/entrar')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, search }) => {
    if (await obterColaboradorAtual(context.queryClient)) {
      throw redirect({ href: retornoSeguro(search.retorno) });
    }
  },
  component: LoginPage,
});

const credenciaisSchema = z.object({
  email: z.email({ error: 'erros.emailInvalido' }),
  senha: z.string().min(1, { error: 'erros.obrigatorio' }),
});

function LoginPage() {
  const { t } = useTranslation();
  const traduzir = (chave?: string) => (chave ? t(chave) : undefined);
  const { retorno, erro } = Route.useSearch();
  const destino = retornoSeguro(retorno);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: configuracao } = useAuthConfiguracao();
  const form = useForm({ resolver: zodResolver(credenciaisSchema) });
  const login = useAuthLogin({
    mutation: {
      onSuccess: async () => {
        queryClient.removeQueries({ queryKey: getAuthMeQueryKey() });
        await navigate({ href: destino });
      },
    },
  });

  const statusFalha = login.error instanceof ApiError ? login.error.status : undefined;
  const falhaLogin = !login.error
    ? undefined
    : statusFalha === 401
      ? t('login.invalid')
      : statusFalha === 429
        ? t('login.muitasTentativas')
        : t('erros.generico');
  const sso = configuracao?.data.sso;

  return (
    <AuthCard title={t('login.title')}>
      <div className="grid gap-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{t(`login.errors.${erro}`)}</AlertDescription>
          </Alert>
        )}
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((dados) => login.mutate({ data: dados }))}
        >
          <FormField
            id="email"
            type="email"
            autoComplete="username"
            label={t('login.email')}
            error={traduzir(form.formState.errors.email?.message)}
            {...form.register('email')}
          />
          <FormField
            id="senha"
            type="password"
            autoComplete="current-password"
            label={t('login.senha')}
            error={traduzir(form.formState.errors.senha?.message)}
            {...form.register('senha')}
          />
          {falhaLogin && (
            <p role="alert" className="text-sm text-destructive">
              {falhaLogin}
            </p>
          )}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
        {sso?.habilitado && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t('login.or')}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" asChild>
              {/* Navegação completa: o SSO redireciona para o provedor de identidade. */}
              <a href={`/api/auth/sso/entrar?retorno=${encodeURIComponent(destino)}`}>
                {sso.rotulo}
              </a>
            </Button>
          </>
        )}
      </div>
    </AuthCard>
  );
}
