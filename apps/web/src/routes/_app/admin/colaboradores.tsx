import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiError,
  type ContaLocalCriadaDtoOutput,
  getColaboradoresListarQueryKey,
  useColaboradoresCriarContaLocal,
  useColaboradoresListar,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const Route = createFileRoute('/_app/admin/colaboradores')({
  component: ColaboradoresPage,
});

const novaContaSchema = z.object({
  nome: z.string().trim().min(1, { error: 'erros.obrigatorio' }),
  email: z.email({ error: 'erros.emailInvalido' }),
  administrador: z.boolean(),
});

function ColaboradoresPage() {
  const { t } = useTranslation();
  const { data } = useColaboradoresListar();
  const colaboradores = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('colaboradores.title')}</h1>
        <p className="text-muted-foreground">{t('colaboradores.subtitle')}</p>
      </div>
      <NovaContaLocal />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('colaboradores.colunas.nome')}</TableHead>
                <TableHead>{t('colaboradores.colunas.email')}</TableHead>
                <TableHead>{t('colaboradores.colunas.papel')}</TableHead>
                <TableHead>{t('colaboradores.colunas.situacao')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {colaboradores.map((colaborador) => (
                <TableRow key={colaborador.id}>
                  <TableCell className="font-medium">{colaborador.nome}</TableCell>
                  <TableCell>{colaborador.email}</TableCell>
                  <TableCell>
                    {colaborador.administrador
                      ? t('colaboradores.papel.administrador')
                      : t('colaboradores.papel.colaborador')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={colaborador.ativo ? 'secondary' : 'outline'}>
                      {colaborador.ativo
                        ? t('colaboradores.situacao.ativo')
                        : t('colaboradores.situacao.inativo')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NovaContaLocal() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [criada, setCriada] = useState<ContaLocalCriadaDtoOutput>();
  const form = useForm({
    resolver: zodResolver(novaContaSchema),
    defaultValues: { nome: '', email: '', administrador: false },
  });
  const criar = useColaboradoresCriarContaLocal({
    mutation: {
      onSuccess: async (resposta) => {
        setCriada(resposta.data);
        form.reset();
        await queryClient.invalidateQueries({ queryKey: getColaboradoresListarQueryKey() });
      },
    },
  });
  const erro = (campo: 'nome' | 'email') => {
    const mensagem = form.formState.errors[campo]?.message;
    return mensagem && t(mensagem);
  };
  const falha = !criar.error
    ? undefined
    : criar.error instanceof ApiError && criar.error.status === 409
      ? t('erros.emailDuplicado')
      : t('erros.generico');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('colaboradores.novaConta')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          noValidate
          onSubmit={form.handleSubmit((dados) => {
            setCriada(undefined);
            criar.mutate({ data: dados });
          })}
        >
          <FormField
            id="nome"
            label={t('colaboradores.nome')}
            error={erro('nome')}
            {...form.register('nome')}
          />
          <FormField
            id="email"
            type="email"
            label={t('colaboradores.email')}
            error={erro('email')}
            {...form.register('email')}
          />
          <Button type="submit" disabled={criar.isPending}>
            <UserPlus />
            {t('colaboradores.criar')}
          </Button>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" className="size-4" {...form.register('administrador')} />
            {t('colaboradores.administrador')}
          </label>
        </form>
        {falha && (
          <p role="alert" className="text-sm text-destructive">
            {falha}
          </p>
        )}
        {criada && <SenhaTemporaria conta={criada} />}
      </CardContent>
    </Card>
  );
}

function SenhaTemporaria({ conta }: { conta: ContaLocalCriadaDtoOutput }) {
  const { t } = useTranslation();
  const [copiado, setCopiado] = useState(false);
  return (
    <Alert>
      <AlertTitle>{t('colaboradores.criada', { nome: conta.colaborador.nome })}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t('colaboradores.senhaTemporaria')}</p>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-foreground">
            {conta.senhaTemporaria}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(conta.senhaTemporaria);
              setCopiado(true);
            }}
          >
            {copiado ? <Check /> : <Copy />}
            {copiado ? t('colaboradores.copiado') : t('colaboradores.copiar')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
