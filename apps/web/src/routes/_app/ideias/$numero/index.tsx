import {
  ApiError,
  getIdeiasDetalharQueryKey,
  getIdeiasListarQueryKey,
  type IdeiaDtoOutput,
  type IdeiaDtoOutputPermissoesTransicoesItem,
  useCategoriasListar,
  useIdeiasDetalhar,
  useIdeiasExcluir,
  useIdeiasMudarStatus,
  useIdeiasPublicar,
  useIdeiasRecategorizar,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Pencil, Send, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Curtidas } from '@/components/curtidas';
import { NativeSelect } from '@/components/native-select';
import { StatusBadge } from '@/components/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatarData, formatarDataHora } from '@/lib/datas';

export const Route = createFileRoute('/_app/ideias/$numero/')({ component: IdeiaPage });

function useAtualizarIdeia(numero: number) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getIdeiasDetalharQueryKey(numero) }),
      queryClient.invalidateQueries({ queryKey: getIdeiasListarQueryKey() }),
    ]);
  };
}

/** Mensagem da API (regras de negócio vêm em português) ou genérica. */
function mensagemDaApi(erro: unknown, padrao: string) {
  if (erro instanceof ApiError) {
    return (erro.body as { message?: string } | undefined)?.message ?? padrao;
  }
  return erro ? padrao : undefined;
}

function IdeiaPage() {
  const { t } = useTranslation();
  const numero = Number(Route.useParams().numero);
  const { data, error } = useIdeiasDetalhar(numero, { query: { retry: false } });
  const ideia = data?.data;

  if (error instanceof ApiError && error.status === 404) {
    return <p className="text-center text-muted-foreground">{t('ideias.naoEncontrada')}</p>;
  }
  if (!ideia) return null;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={ideia.status} />
          <span>#{ideia.numero}</span>
          <span>· {ideia.categoria.nome}</span>
        </div>
        <h1 className="text-2xl font-semibold">{ideia.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {t('ideias.por', { nome: ideia.autor.nome })} ·{' '}
          {ideia.publicadaEm
            ? t('ideias.publicadaEm', { data: formatarData(ideia.publicadaEm) })
            : t('ideias.criadaEm', { data: formatarData(ideia.criadaEm) })}
          {ideia.editadaEm && ` · ${t('ideias.editada')}`}
        </p>
      </header>

      {ideia.ideiaOriginal && (
        <Alert>
          <AlertDescription>
            {t('ideias.duplicadaDe')}{' '}
            <Link
              className="font-medium underline"
              to="/ideias/$numero"
              params={{ numero: String(ideia.ideiaOriginal.numero) }}
            >
              {t('ideias.verOriginal', ideia.ideiaOriginal)}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <AcoesDoAutor ideia={ideia} />

      <div className="space-y-5">
        {ideia.respostas.map((resposta) => (
          <section key={resposta.campoId} className="space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground">{resposta.rotulo}</h2>
            <p className="whitespace-pre-wrap">{exibirValor(resposta.valor, t)}</p>
          </section>
        ))}
      </div>

      {ideia.status !== 'rascunho' && <Curtidas ideia={ideia} />}

      {(ideia.permissoes.transicoes.length > 0 || ideia.permissoes.podeRecategorizar) && (
        <PainelDeAvaliacao ideia={ideia} />
      )}

      <Historico ideia={ideia} />
    </article>
  );
}

function exibirValor(valor: IdeiaDtoOutput['valores'][string], t: (chave: string) => string) {
  if (Array.isArray(valor)) return valor.join(', ');
  if (typeof valor === 'boolean') return valor ? t('ideias.sim') : t('ideias.nao');
  return String(valor ?? '');
}

function AcoesDoAutor({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const atualizar = useAtualizarIdeia(ideia.numero);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const publicar = useIdeiasPublicar({ mutation: { onSuccess: atualizar } });
  const excluir = useIdeiasExcluir({
    mutation: {
      onSuccess: async () => {
        await atualizar();
        await navigate({ to: '/' });
      },
    },
  });
  const { podeEditar, podePublicar, podeExcluir } = ideia.permissoes;
  if (!podeEditar && !podePublicar && !podeExcluir) return null;

  const falha = mensagemDaApi(publicar.error ?? excluir.error, t('erros.generico'));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {podePublicar && (
          <Button
            disabled={publicar.isPending}
            onClick={() => publicar.mutate({ numero: ideia.numero })}
          >
            <Send />
            {t('ideias.publicar')}
          </Button>
        )}
        {podeEditar && (
          <Button variant="outline" asChild>
            <Link to="/ideias/$numero/editar" params={{ numero: String(ideia.numero) }}>
              <Pencil />
              {t('ideias.editar')}
            </Link>
          </Button>
        )}
        {podeExcluir && (
          <Button
            variant={confirmandoExclusao ? 'destructive' : 'ghost'}
            disabled={excluir.isPending}
            onClick={() =>
              confirmandoExclusao
                ? excluir.mutate({ numero: ideia.numero })
                : setConfirmandoExclusao(true)
            }
          >
            <Trash2 />
            {confirmandoExclusao ? t('ideias.confirmarExclusao') : t('ideias.excluir')}
          </Button>
        )}
      </div>
      {falha && (
        <p role="alert" className="text-sm text-destructive">
          {falha}
        </p>
      )}
    </div>
  );
}

function PainelDeAvaliacao({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('ideias.avaliacao')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-8 md:grid-cols-2">
        {ideia.permissoes.transicoes.length > 0 && <MudarStatus ideia={ideia} />}
        {ideia.permissoes.podeRecategorizar && <Recategorizar ideia={ideia} />}
      </CardContent>
    </Card>
  );
}

function MudarStatus({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  const atualizar = useAtualizarIdeia(ideia.numero);
  const [para, setPara] = useState<IdeiaDtoOutputPermissoesTransicoesItem | ''>('');
  const [justificativa, setJustificativa] = useState('');
  const [numeroOriginal, setNumeroOriginal] = useState('');
  const mudar = useIdeiasMudarStatus({
    mutation: {
      onSuccess: async () => {
        setPara('');
        setJustificativa('');
        setNumeroOriginal('');
        await atualizar();
      },
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!para || para === 'rascunho') return;
    mudar.mutate({
      numero: ideia.numero,
      data: {
        para,
        justificativa,
        ideiaOriginalNumero: para === 'duplicada' ? Number(numeroOriginal) || undefined : undefined,
      },
    });
  }

  const falha = mensagemDaApi(mudar.error, t('erros.generico'));
  return (
    <form className="grid gap-3" onSubmit={enviar}>
      <div className="grid gap-2">
        <Label htmlFor="novo-status">{t('ideias.novoStatus')}</Label>
        <NativeSelect
          id="novo-status"
          value={para}
          onChange={(evento) => setPara(evento.target.value as typeof para)}
        >
          <option value="">{t('ideias.escolhaStatus')}</option>
          {ideia.permissoes.transicoes.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {para === 'duplicada' && (
        <div className="grid gap-2">
          <Label htmlFor="numero-original">{t('ideias.numeroOriginal')}</Label>
          <Input
            id="numero-original"
            inputMode="numeric"
            value={numeroOriginal}
            onChange={(evento) => setNumeroOriginal(evento.target.value.replace(/\D/g, ''))}
          />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="justificativa-status">{t('ideias.justificativa')}</Label>
        <Textarea
          id="justificativa-status"
          rows={3}
          value={justificativa}
          onChange={(evento) => setJustificativa(evento.target.value)}
        />
        <p className="text-sm text-muted-foreground">{t('ideias.justificativaAjuda')}</p>
      </div>
      {falha && (
        <p role="alert" className="text-sm text-destructive">
          {falha}
        </p>
      )}
      <Button
        type="submit"
        className="justify-self-start"
        disabled={!para || !justificativa.trim() || mudar.isPending}
      >
        {t('ideias.aplicar')}
      </Button>
    </form>
  );
}

function Recategorizar({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  const atualizar = useAtualizarIdeia(ideia.numero);
  const { data } = useCategoriasListar();
  const [categoriaId, setCategoriaId] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const recategorizar = useIdeiasRecategorizar({
    mutation: {
      onSuccess: async () => {
        setCategoriaId('');
        setJustificativa('');
        await atualizar();
      },
    },
  });
  const outras = (data?.data ?? []).filter((categoria) => categoria.id !== ideia.categoria.id);
  const falha = mensagemDaApi(recategorizar.error, t('erros.generico'));

  return (
    <form
      className="grid gap-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        recategorizar.mutate({ numero: ideia.numero, data: { categoriaId, justificativa } });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="nova-categoria">{t('ideias.novaCategoria')}</Label>
        <NativeSelect
          id="nova-categoria"
          value={categoriaId}
          onChange={(evento) => setCategoriaId(evento.target.value)}
        >
          <option value="">{t('ideias.escolhaCategoria')}</option>
          {outras.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="justificativa-categoria">{t('ideias.justificativa')}</Label>
        <Textarea
          id="justificativa-categoria"
          rows={3}
          value={justificativa}
          onChange={(evento) => setJustificativa(evento.target.value)}
        />
      </div>
      {falha && (
        <p role="alert" className="text-sm text-destructive">
          {falha}
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start"
        disabled={!categoriaId || !justificativa.trim() || recategorizar.isPending}
      >
        {t('ideias.recategorizar')}
      </Button>
    </form>
  );
}

function Historico({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  if (!ideia.historico.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t('ideias.historico')}</h2>
      <ol className="space-y-4 border-l pl-4">
        {ideia.historico.map((evento) => {
          const nome = evento.colaborador.nome;
          const descricao =
            evento.tipo === 'categoria'
              ? t('ideias.mudouCategoria', { nome, de: evento.de, para: evento.para })
              : evento.de
                ? t('ideias.mudouStatus', {
                    nome,
                    de: t(`status.${evento.de}`),
                    para: t(`status.${evento.para}`),
                  })
                : t('ideias.publicou', { nome });
          return (
            <li key={evento.id} className="space-y-1">
              <p className="text-sm">
                <span className="font-medium">{descricao}</span>{' '}
                <time className="text-muted-foreground" dateTime={evento.em}>
                  · {formatarDataHora(evento.em)}
                </time>
              </p>
              {evento.justificativa && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {evento.justificativa}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
