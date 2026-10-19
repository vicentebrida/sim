import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiError,
  type CategoriaDtoOutput,
  getCategoriasListarQueryKey,
  useCategoriasAtualizar,
  useCategoriasCriar,
  useCategoriasDefinirAvaliadores,
  useCategoriasListar,
  useColaboradoresListar,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus, Power, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_app/admin/categorias')({ component: CategoriasPage });

const PARAMS = { incluirInativas: 'true' };

const categoriaSchema = z.object({
  nome: z.string().trim().min(1, { error: 'erros.obrigatorio' }).max(60),
  descricao: z.string().trim().max(280),
});
type DadosCategoria = z.infer<typeof categoriaSchema>;

function useRecarregarCategorias() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getCategoriasListarQueryKey() });
}

function mensagemDeFalha(erro: unknown, t: (chave: string) => string) {
  if (!erro) return undefined;
  return erro instanceof ApiError && erro.status === 409
    ? t('categorias.nomeDuplicado')
    : t('erros.generico');
}

function CategoriasPage() {
  const { t } = useTranslation();
  const { data } = useCategoriasListar(PARAMS);
  const categorias = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('categorias.title')}</h1>
        <p className="text-muted-foreground">{t('categorias.subtitle')}</p>
      </div>
      <NovaCategoria />
      {data && categorias.length === 0 && (
        <p className="text-center text-muted-foreground">{t('categorias.nenhumaCategoria')}</p>
      )}
      <ul className="space-y-4">
        {categorias.map((categoria) => (
          <li key={categoria.id}>
            <CategoriaItem categoria={categoria} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CamposDaCategoria({
  form,
  prefixo,
}: {
  form: ReturnType<typeof useForm<DadosCategoria>>;
  prefixo: string;
}) {
  const { t } = useTranslation();
  const erroNome = form.formState.errors.nome?.message;
  return (
    <>
      <FormField
        id={`${prefixo}-nome`}
        label={t('categorias.nome')}
        error={erroNome && t(erroNome)}
        {...form.register('nome')}
      />
      <div className="grid gap-2">
        <Label htmlFor={`${prefixo}-descricao`}>{t('categorias.descricao')}</Label>
        <Textarea id={`${prefixo}-descricao`} rows={2} {...form.register('descricao')} />
        <p className="text-sm text-muted-foreground">{t('categorias.descricaoAjuda')}</p>
      </div>
    </>
  );
}

function NovaCategoria() {
  const { t } = useTranslation();
  const recarregar = useRecarregarCategorias();
  const form = useForm<DadosCategoria>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nome: '', descricao: '' },
  });
  const criar = useCategoriasCriar({
    mutation: {
      onSuccess: async () => {
        form.reset();
        await recarregar();
      },
    },
  });
  const falha = mensagemDeFalha(criar.error, t);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('categorias.nova')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((dados) => criar.mutate({ data: dados }))}
        >
          <CamposDaCategoria form={form} prefixo="nova" />
          {falha && (
            <p role="alert" className="text-sm text-destructive">
              {falha}
            </p>
          )}
          <Button type="submit" className="justify-self-start" disabled={criar.isPending}>
            <Plus />
            {t('categorias.criar')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

type Modo = 'ver' | 'editar' | 'avaliadores';

function CategoriaItem({ categoria }: { categoria: CategoriaDtoOutput }) {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>('ver');
  const recarregar = useRecarregarCategorias();
  const alternarAtiva = useCategoriasAtualizar({ mutation: { onSuccess: recarregar } });

  return (
    <Card className={categoria.ativa ? undefined : 'opacity-70'}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {categoria.nome}
              {!categoria.ativa && <Badge variant="outline">{t('categorias.inativa')}</Badge>}
            </h2>
            {categoria.descricao && (
              <p className="text-sm text-muted-foreground">{categoria.descricao}</p>
            )}
          </div>
          {modo === 'ver' && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setModo('editar')}>
                <Pencil />
                {t('categorias.editar')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setModo('avaliadores')}>
                <Users />
                {t('categorias.definirAvaliadores')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={alternarAtiva.isPending}
                onClick={() =>
                  alternarAtiva.mutate({ id: categoria.id, data: { ativa: !categoria.ativa } })
                }
              >
                <Power />
                {categoria.ativa ? t('categorias.desativar') : t('categorias.reativar')}
              </Button>
            </div>
          )}
        </div>

        {modo === 'editar' && (
          <EditarCategoria categoria={categoria} aoFechar={() => setModo('ver')} />
        )}
        {modo === 'avaliadores' && (
          <EscolherAvaliadores categoria={categoria} aoFechar={() => setModo('ver')} />
        )}
        {modo !== 'avaliadores' && (
          <div className="text-sm">
            <span className="font-medium">{t('categorias.avaliadores')}: </span>
            {categoria.avaliadores.length ? (
              categoria.avaliadores.map((avaliador) => avaliador.nome).join(', ')
            ) : (
              <span className="text-muted-foreground">{t('categorias.semAvaliadores')}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditarCategoria({
  categoria,
  aoFechar,
}: {
  categoria: CategoriaDtoOutput;
  aoFechar: () => void;
}) {
  const { t } = useTranslation();
  const recarregar = useRecarregarCategorias();
  const form = useForm<DadosCategoria>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nome: categoria.nome, descricao: categoria.descricao },
  });
  const atualizar = useCategoriasAtualizar({
    mutation: {
      onSuccess: async () => {
        await recarregar();
        aoFechar();
      },
    },
  });
  const falha = mensagemDeFalha(atualizar.error, t);

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit((dados) => atualizar.mutate({ id: categoria.id, data: dados }))}
    >
      <CamposDaCategoria form={form} prefixo={categoria.id} />
      {falha && (
        <p role="alert" className="text-sm text-destructive">
          {falha}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={atualizar.isPending}>
          {t('categorias.salvar')}
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          {t('categorias.cancelar')}
        </Button>
      </div>
    </form>
  );
}

function EscolherAvaliadores({
  categoria,
  aoFechar,
}: {
  categoria: CategoriaDtoOutput;
  aoFechar: () => void;
}) {
  const { t } = useTranslation();
  const recarregar = useRecarregarCategorias();
  const { data } = useColaboradoresListar();
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState(
    () => new Set(categoria.avaliadores.map((avaliador) => avaliador.id)),
  );
  const definir = useCategoriasDefinirAvaliadores({
    mutation: {
      onSuccess: async () => {
        await recarregar();
        aoFechar();
      },
    },
  });

  const termo = busca.trim().toLowerCase();
  const candidatos = (data?.data ?? []).filter(
    (colaborador) =>
      colaborador.ativo &&
      (!termo ||
        colaborador.nome.toLowerCase().includes(termo) ||
        colaborador.email.includes(termo)),
  );

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <div className="grid gap-3">
      <Input
        aria-label={t('categorias.buscarColaborador')}
        placeholder={t('categorias.buscarColaborador')}
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
      />
      <fieldset className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
        <legend className="sr-only">{t('categorias.avaliadores')}</legend>
        {candidatos.map((colaborador) => (
          <label
            key={colaborador.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
          >
            <input
              type="checkbox"
              className="size-4"
              checked={selecionados.has(colaborador.id)}
              onChange={() => alternar(colaborador.id)}
            />
            <span>{colaborador.nome}</span>
            <span className="text-muted-foreground">{colaborador.email}</span>
          </label>
        ))}
      </fieldset>
      {definir.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('erros.generico')}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={definir.isPending}
          onClick={() =>
            definir.mutate({ id: categoria.id, data: { colaboradorIds: [...selecionados] } })
          }
        >
          {t('categorias.salvar')}
        </Button>
        <Button variant="ghost" onClick={aoFechar}>
          {t('categorias.cancelar')}
        </Button>
      </div>
    </div>
  );
}
