import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError, getAuthMeQueryKey, useAuthTrocarSenha } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { obterColaboradorAtual, SENHA_MINIMA } from '@/lib/auth';

export const Route = createFileRoute('/trocar-senha')({
  beforeLoad: async ({ context }) => {
    const colaborador = await obterColaboradorAtual(context.queryClient);
    if (!colaborador) throw redirect({ to: '/entrar' });
    if (!colaborador.deveTrocarSenha) throw redirect({ to: '/' });
  },
  component: TrocarSenhaPage,
});

const trocaSchema = z
  .object({
    senhaAtual: z.string().min(1, { error: 'erros.obrigatorio' }),
    novaSenha: z.string().min(SENHA_MINIMA, { error: 'trocarSenha.minimo' }),
    confirmacao: z.string(),
  })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    path: ['confirmacao'],
    error: 'trocarSenha.naoConfere',
  });

function TrocarSenhaPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const form = useForm({ resolver: zodResolver(trocaSchema) });
  const trocar = useAuthTrocarSenha({
    mutation: {
      onSuccess: async () => {
        // Remover (e não só invalidar): o guard de rota lê o cache com ensureQueryData.
        queryClient.removeQueries({ queryKey: getAuthMeQueryKey() });
        await navigate({ to: '/' });
      },
    },
  });

  const erro = (campo: keyof z.infer<typeof trocaSchema>) => {
    const mensagem = form.formState.errors[campo]?.message;
    return mensagem && t(mensagem, { min: SENHA_MINIMA });
  };
  // A API devolve mensagens de regra de negócio (ex.: "Senha atual incorreta") em português.
  const falha = !trocar.error
    ? undefined
    : trocar.error instanceof ApiError
      ? ((trocar.error.body as { message?: string } | undefined)?.message ?? t('erros.generico'))
      : t('erros.generico');

  return (
    <AuthCard title={t('trocarSenha.title')} description={t('trocarSenha.description')}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={form.handleSubmit(({ senhaAtual, novaSenha }) =>
          trocar.mutate({ data: { senhaAtual, novaSenha } }),
        )}
      >
        <FormField
          id="senhaAtual"
          type="password"
          autoComplete="current-password"
          label={t('trocarSenha.senhaAtual')}
          error={erro('senhaAtual')}
          {...form.register('senhaAtual')}
        />
        <FormField
          id="novaSenha"
          type="password"
          autoComplete="new-password"
          label={t('trocarSenha.novaSenha')}
          error={erro('novaSenha')}
          {...form.register('novaSenha')}
        />
        <FormField
          id="confirmacao"
          type="password"
          autoComplete="new-password"
          label={t('trocarSenha.confirmacao')}
          error={erro('confirmacao')}
          {...form.register('confirmacao')}
        />
        {falha && (
          <p role="alert" className="text-sm text-destructive">
            {falha}
          </p>
        )}
        <Button type="submit" disabled={trocar.isPending}>
          {t('trocarSenha.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
