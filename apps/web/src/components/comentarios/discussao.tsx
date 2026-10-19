import {
  type ComentarioDtoOutput,
  type ComentarioDtoOutputRespostasItem,
  getComentariosListarQueryKey,
  getIdeiasDetalharQueryKey,
  getIdeiasListarQueryKey,
  type IdeiaDtoOutput,
  useComentariosCriar,
  useComentariosEditar,
  useComentariosListar,
  useComentariosOcultar,
  useComentariosRemover,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatarDataHora } from '@/lib/datas';
import { mensagemDaApi } from '@/lib/erros';
import { segmentar } from '@/lib/mencoes';
import { EditorDeComentario } from './editor-de-comentario';

type Comentario = ComentarioDtoOutput | ComentarioDtoOutputRespostasItem;
type Evento = IdeiaDtoOutput['historico'][number];

type Item =
  | { tipo: 'evento'; em: string; evento: Evento }
  | { tipo: 'comentario'; em: string; comentario: ComentarioDtoOutput };

function useAtualizarDiscussao(numero: number) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getComentariosListarQueryKey(numero) }),
      // Comentários mudam o que o Autor pode fazer (excluir) e a posição em "Em alta".
      queryClient.invalidateQueries({ queryKey: getIdeiasDetalharQueryKey(numero) }),
      queryClient.invalidateQueries({ queryKey: getIdeiasListarQueryKey() }),
    ]);
}

/** Comentários e eventos do Histórico da Ideia, numa única sequência cronológica. */
export function Discussao({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  const { data } = useComentariosListar(ideia.numero);
  const atualizar = useAtualizarDiscussao(ideia.numero);
  const criar = useComentariosCriar({ mutation: { onSuccess: atualizar } });
  const comentarios = data?.data ?? [];

  const itens: Item[] = [
    ...ideia.historico.map((evento) => ({ tipo: 'evento' as const, em: evento.em, evento })),
    ...comentarios.map((comentario) => ({
      tipo: 'comentario' as const,
      em: comentario.criadoEm,
      comentario,
    })),
  ].sort((a, b) => a.em.localeCompare(b.em));

  return (
    <section className="space-y-4" aria-labelledby="discussao">
      <h2 id="discussao" className="text-lg font-semibold">
        {t('comentarios.titulo')}
      </h2>
      <ol className="space-y-5">
        {itens.map((item) =>
          item.tipo === 'evento' ? (
            <li key={item.evento.id} className="border-l-2 pl-4">
              <EventoDoHistorico evento={item.evento} />
            </li>
          ) : (
            <li key={item.comentario.id}>
              <ComentarioComRespostas comentario={item.comentario} ideia={ideia} />
            </li>
          ),
        )}
      </ol>
      {ideia.status !== 'rascunho' && (
        <EditorDeComentario
          rotulo={t('comentarios.novo')}
          rotuloEnviar={t('comentarios.comentar')}
          enviando={criar.isPending}
          erro={mensagemDaApi(criar.error, t('erros.generico'))}
          aoEnviar={(texto) => criar.mutateAsync({ numero: ideia.numero, data: { texto } })}
        />
      )}
    </section>
  );
}

function EventoDoHistorico({ evento }: { evento: Evento }) {
  const { t } = useTranslation();
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
    <div className="space-y-1">
      <p className="text-sm">
        <span className="font-medium">{descricao}</span>{' '}
        <time className="text-muted-foreground" dateTime={evento.em}>
          · {formatarDataHora(evento.em)}
        </time>
      </p>
      {evento.justificativa && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{evento.justificativa}</p>
      )}
    </div>
  );
}

function ComentarioComRespostas({
  comentario,
  ideia,
}: {
  comentario: ComentarioDtoOutput;
  ideia: IdeiaDtoOutput;
}) {
  const { t } = useTranslation();
  const [respondendo, setRespondendo] = useState(false);
  const atualizar = useAtualizarDiscussao(ideia.numero);
  const responder = useComentariosCriar({ mutation: { onSuccess: atualizar } });

  return (
    <div className="space-y-3">
      <CartaoDeComentario
        comentario={comentario}
        ideia={ideia}
        aoResponder={() => setRespondendo(true)}
      />
      {(comentario.respostas.length > 0 || respondendo) && (
        <ol className="ml-6 space-y-3 border-l pl-4" aria-label={t('comentarios.respostas')}>
          {comentario.respostas.map((resposta) => (
            <li key={resposta.id}>
              <CartaoDeComentario comentario={resposta} ideia={ideia} />
            </li>
          ))}
          {respondendo && (
            <li>
              <EditorDeComentario
                rotulo={t('comentarios.respondendoA', { nome: comentario.autor.nome })}
                rotuloEnviar={t('comentarios.responder')}
                enviando={responder.isPending}
                erro={mensagemDaApi(responder.error, t('erros.generico'))}
                autoFocus
                aoCancelar={() => setRespondendo(false)}
                aoEnviar={async (texto) => {
                  await responder.mutateAsync({
                    numero: ideia.numero,
                    data: { texto, respostaAId: comentario.id },
                  });
                  setRespondendo(false);
                }}
              />
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function CartaoDeComentario({
  comentario,
  ideia,
  aoResponder,
}: {
  comentario: Comentario;
  ideia: IdeiaDtoOutput;
  aoResponder?: () => void;
}) {
  const { t } = useTranslation();
  const atualizar = useAtualizarDiscussao(ideia.numero);
  const [modo, setModo] = useState<'ler' | 'editar' | 'ocultar' | 'remover'>('ler');
  const editar = useComentariosEditar({ mutation: { onSuccess: atualizar } });
  const remover = useComentariosRemover({ mutation: { onSuccess: atualizar } });
  const { podeResponder, podeEditar, podeRemover, podeOcultar } = comentario.permissoes;

  return (
    <article
      className="space-y-1"
      aria-label={t('comentarios.de', { nome: comentario.autor.nome })}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{comentario.autor.nome}</span>
        {comentario.autor.id === ideia.autor.id && (
          <Badge variant="secondary">{t('comentarios.autorDaIdeia')}</Badge>
        )}
        <time className="text-muted-foreground" dateTime={comentario.criadoEm}>
          {formatarDataHora(comentario.criadoEm)}
        </time>
        {comentario.editadoEm && comentario.estado === 'publicado' && (
          <span className="text-muted-foreground">· {t('comentarios.editado')}</span>
        )}
      </p>

      {modo === 'editar' && comentario.texto !== null ? (
        <EditorDeComentario
          rotulo={t('comentarios.editar')}
          rotuloEnviar={t('comentarios.salvar')}
          inicial={comentario.texto}
          enviando={editar.isPending}
          erro={mensagemDaApi(editar.error, t('erros.generico'))}
          autoFocus
          aoCancelar={() => setModo('ler')}
          aoEnviar={async (texto) => {
            await editar.mutateAsync({ id: comentario.id, data: { texto } });
            setModo('ler');
          }}
        />
      ) : (
        <CorpoDoComentario comentario={comentario} />
      )}

      {modo === 'ocultar' && (
        <FormularioDeOcultacao
          comentario={comentario}
          aoConcluir={() => setModo('ler')}
          atualizar={atualizar}
        />
      )}

      {modo !== 'editar' && modo !== 'ocultar' && (
        <div className="flex flex-wrap gap-1">
          {aoResponder && podeResponder && (
            <Button variant="ghost" size="sm" onClick={aoResponder}>
              {t('comentarios.responder')}
            </Button>
          )}
          {podeEditar && (
            <Button variant="ghost" size="sm" onClick={() => setModo('editar')}>
              {t('comentarios.editar')}
            </Button>
          )}
          {podeRemover && (
            <Button
              variant={modo === 'remover' ? 'destructive' : 'ghost'}
              size="sm"
              disabled={remover.isPending}
              onClick={() =>
                modo === 'remover' ? remover.mutate({ id: comentario.id }) : setModo('remover')
              }
            >
              {modo === 'remover' ? t('comentarios.confirmarRemocao') : t('comentarios.remover')}
            </Button>
          )}
          {podeOcultar && (
            <Button variant="ghost" size="sm" onClick={() => setModo('ocultar')}>
              {t('comentarios.ocultar')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function CorpoDoComentario({ comentario }: { comentario: Comentario }) {
  const { t } = useTranslation();
  if (comentario.estado === 'removido') {
    return <p className="text-sm text-muted-foreground italic">{t('comentarios.removido')}</p>;
  }
  return (
    <div className="space-y-1">
      {comentario.estado === 'oculto' && comentario.ocultacao && (
        <p className="text-sm text-muted-foreground italic">
          {t('comentarios.oculto', {
            nome: comentario.ocultacao.por.nome,
            motivo: comentario.ocultacao.motivo,
          })}
        </p>
      )}
      {comentario.texto !== null && (
        <p
          className={
            comentario.estado === 'oculto'
              ? 'rounded-md bg-muted p-2 text-sm whitespace-pre-wrap text-muted-foreground'
              : 'whitespace-pre-wrap'
          }
        >
          <TextoComMencoes texto={comentario.texto} />
        </p>
      )}
      {comentario.estado === 'oculto' && comentario.texto !== null && (
        <p className="text-xs text-muted-foreground">{t('comentarios.textoOcultoVisivel')}</p>
      )}
    </div>
  );
}

function TextoComMencoes({ texto }: { texto: string }) {
  return segmentar(texto).map((segmento, indice) =>
    segmento.tipo === 'texto' ? (
      segmento.valor
    ) : (
      <span key={indice} className="font-medium text-primary">
        @{segmento.nome}
      </span>
    ),
  );
}

function FormularioDeOcultacao({
  comentario,
  aoConcluir,
  atualizar,
}: {
  comentario: Comentario;
  aoConcluir: () => void;
  atualizar: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState('');
  const ocultar = useComentariosOcultar({
    mutation: {
      onSuccess: async () => {
        await atualizar();
        aoConcluir();
      },
    },
  });
  const campo = `motivo-${comentario.id}`;
  const falha = mensagemDaApi(ocultar.error, t('erros.generico'));

  return (
    <form
      className="grid gap-2 rounded-md border p-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        ocultar.mutate({ id: comentario.id, data: { motivo } });
      }}
    >
      <label htmlFor={campo} className="text-sm font-medium">
        {t('comentarios.motivo')}
      </label>
      <Textarea
        id={campo}
        rows={2}
        value={motivo}
        autoFocus
        onChange={(evento) => setMotivo(evento.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t('comentarios.motivoAjuda')}</p>
      {falha && (
        <p role="alert" className="text-sm text-destructive">
          {falha}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={!motivo.trim() || ocultar.isPending}
        >
          {t('comentarios.confirmarOcultacao')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={aoConcluir}>
          {t('comentarios.cancelar')}
        </Button>
      </div>
    </form>
  );
}
