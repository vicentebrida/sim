import {
  ApiError,
  type CampoPersonalizadoDtoOutput,
  type CampoPersonalizadoDtoOutputTipo,
  getCamposPersonalizadosListarQueryKey,
  useCamposPersonalizadosAtualizar,
  useCamposPersonalizadosCriar,
  useCamposPersonalizadosExcluir,
  useCamposPersonalizadosListar,
  useCamposPersonalizadosReordenar,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_app/admin/campos')({ component: CamposPage });

const TIPOS: CampoPersonalizadoDtoOutputTipo[] = [
  'texto_curto',
  'texto_longo',
  'selecao_unica',
  'selecao_multipla',
  'numero',
  'sim_nao',
];
const COM_OPCOES = ['selecao_unica', 'selecao_multipla'];
const DE_TEXTO = ['texto_curto', 'texto_longo'];
const PARAMS = { incluirInativos: 'true' };

function useRecarregarCampos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getCamposPersonalizadosListarQueryKey() });
}

function mensagemDaApi(erro: unknown, padrao: string) {
  if (!erro) return undefined;
  return erro instanceof ApiError
    ? ((erro.body as { message?: string } | undefined)?.message ?? padrao)
    : padrao;
}

function CamposPage() {
  const { t } = useTranslation();
  const { data } = useCamposPersonalizadosListar(PARAMS);
  const campos = data?.data ?? [];
  const recarregar = useRecarregarCampos();
  const reordenar = useCamposPersonalizadosReordenar({ mutation: { onSuccess: recarregar } });

  function mover(indice: number, direcao: -1 | 1) {
    const ids = campos.map((campo) => campo.id);
    const destino = indice + direcao;
    [ids[indice], ids[destino]] = [ids[destino]!, ids[indice]!];
    reordenar.mutate({ data: { ids } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('campos.title')}</h1>
        <p className="text-muted-foreground">{t('campos.subtitle')}</p>
      </div>
      <NovoCampo />
      <ol className="space-y-3">
        {campos.map((campo, indice) => (
          <li key={campo.id}>
            <CampoItem
              campo={campo}
              podeSubir={indice > 0}
              podeDescer={indice < campos.length - 1}
              aoMover={(direcao) => mover(indice, direcao)}
              movendo={reordenar.isPending}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Configuracao {
  rotulo: string;
  ajuda: string;
  obrigatorio: boolean;
  opcoesTexto: string;
  usarNaDeteccao: boolean;
}

const opcoesDoTexto = (texto: string) => [
  ...new Set(
    texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean),
  ),
];

function CamposDeConfiguracao({
  prefixo,
  tipo,
  valor,
  aoMudar,
}: {
  prefixo: string;
  tipo: CampoPersonalizadoDtoOutputTipo;
  valor: Configuracao;
  aoMudar: (mudanca: Partial<Configuracao>) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <FormField
        id={`${prefixo}-rotulo`}
        label={t('campos.rotulo')}
        value={valor.rotulo}
        maxLength={80}
        onChange={(evento) => aoMudar({ rotulo: evento.target.value })}
      />
      <FormField
        id={`${prefixo}-ajuda`}
        label={t('campos.ajuda')}
        value={valor.ajuda}
        maxLength={280}
        onChange={(evento) => aoMudar({ ajuda: evento.target.value })}
      />
      {COM_OPCOES.includes(tipo) && (
        <div className="grid gap-2">
          <Label htmlFor={`${prefixo}-opcoes`}>{t('campos.opcoes')}</Label>
          <Textarea
            id={`${prefixo}-opcoes`}
            rows={4}
            value={valor.opcoesTexto}
            onChange={(evento) => aoMudar({ opcoesTexto: evento.target.value })}
          />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={valor.obrigatorio}
          onChange={(evento) => aoMudar({ obrigatorio: evento.target.checked })}
        />
        {t('campos.obrigatorio')}
      </label>
      {DE_TEXTO.includes(tipo) && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={valor.usarNaDeteccao}
            onChange={(evento) => aoMudar({ usarNaDeteccao: evento.target.checked })}
          />
          {t('campos.usarNaDeteccao')}
        </label>
      )}
    </>
  );
}

const CONFIGURACAO_VAZIA: Configuracao = {
  rotulo: '',
  ajuda: '',
  obrigatorio: false,
  opcoesTexto: '',
  usarNaDeteccao: false,
};

function NovoCampo() {
  const { t } = useTranslation();
  const recarregar = useRecarregarCampos();
  const [tipo, setTipo] = useState<CampoPersonalizadoDtoOutputTipo>('texto_longo');
  const [configuracao, setConfiguracao] = useState(CONFIGURACAO_VAZIA);
  const criar = useCamposPersonalizadosCriar({
    mutation: {
      onSuccess: async () => {
        setConfiguracao(CONFIGURACAO_VAZIA);
        await recarregar();
      },
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    criar.mutate({
      data: {
        rotulo: configuracao.rotulo,
        ajuda: configuracao.ajuda,
        tipo,
        obrigatorio: configuracao.obrigatorio,
        opcoes: COM_OPCOES.includes(tipo) ? opcoesDoTexto(configuracao.opcoesTexto) : [],
        usarNaDeteccao: DE_TEXTO.includes(tipo) && configuracao.usarNaDeteccao,
      },
    });
  }

  const falha = mensagemDaApi(criar.error, t('erros.generico'));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('campos.novo')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={enviar}>
          <div className="grid gap-2">
            <Label htmlFor="novo-tipo">{t('campos.tipo')}</Label>
            <NativeSelect
              id="novo-tipo"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value as CampoPersonalizadoDtoOutputTipo)}
            >
              {TIPOS.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {t(`campos.tipos.${opcao}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <CamposDeConfiguracao
            prefixo="novo"
            tipo={tipo}
            valor={configuracao}
            aoMudar={(mudanca) => setConfiguracao((atual) => ({ ...atual, ...mudanca }))}
          />
          {falha && (
            <p role="alert" className="text-sm text-destructive">
              {falha}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!configuracao.rotulo.trim() || criar.isPending}
          >
            <Plus />
            {t('campos.criar')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CampoItem({
  campo,
  podeSubir,
  podeDescer,
  aoMover,
  movendo,
}: {
  campo: CampoPersonalizadoDtoOutput;
  podeSubir: boolean;
  podeDescer: boolean;
  aoMover: (direcao: -1 | 1) => void;
  movendo: boolean;
}) {
  const { t } = useTranslation();
  const recarregar = useRecarregarCampos();
  const [editando, setEditando] = useState(false);
  const [configuracao, setConfiguracao] = useState<Configuracao>(() => ({
    rotulo: campo.rotulo,
    ajuda: campo.ajuda,
    obrigatorio: campo.obrigatorio,
    opcoesTexto: campo.opcoes.join('\n'),
    usarNaDeteccao: campo.usarNaDeteccao,
  }));
  const atualizar = useCamposPersonalizadosAtualizar({
    mutation: {
      onSuccess: async () => {
        setEditando(false);
        await recarregar();
      },
    },
  });
  const excluir = useCamposPersonalizadosExcluir({ mutation: { onSuccess: recarregar } });
  const falha =
    excluir.error instanceof ApiError && excluir.error.status === 409
      ? t('campos.emUso')
      : mensagemDaApi(atualizar.error ?? excluir.error, t('erros.generico'));

  function salvar(evento: FormEvent) {
    evento.preventDefault();
    atualizar.mutate({
      id: campo.id,
      data: {
        rotulo: configuracao.rotulo,
        ajuda: configuracao.ajuda,
        obrigatorio: configuracao.obrigatorio,
        usarNaDeteccao: configuracao.usarNaDeteccao,
        ...(COM_OPCOES.includes(campo.tipo)
          ? { opcoes: opcoesDoTexto(configuracao.opcoesTexto) }
          : {}),
      },
    });
  }

  return (
    <Card className={campo.ativo ? undefined : 'opacity-70'}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              {campo.rotulo}
              <Badge variant="secondary">{t(`campos.tipos.${campo.tipo}`)}</Badge>
              {campo.obrigatorio && <Badge variant="outline">{t('campos.obrigatorio')}</Badge>}
              {!campo.ativo && <Badge variant="outline">{t('campos.inativo')}</Badge>}
            </h2>
            {campo.ajuda && <p className="text-sm text-muted-foreground">{campo.ajuda}</p>}
            {campo.opcoes.length > 0 && (
              <p className="text-sm text-muted-foreground">{campo.opcoes.join(' · ')}</p>
            )}
          </div>
          {!editando && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('campos.subir')}
                disabled={!podeSubir || movendo}
                onClick={() => aoMover(-1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('campos.descer')}
                disabled={!podeDescer || movendo}
                onClick={() => aoMover(1)}
              >
                <ArrowDown />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                <Pencil />
                {t('campos.editar')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={atualizar.isPending}
                onClick={() => atualizar.mutate({ id: campo.id, data: { ativo: !campo.ativo } })}
              >
                <Power />
                {campo.ativo ? t('campos.desativar') : t('campos.reativar')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={excluir.isPending}
                onClick={() => excluir.mutate({ id: campo.id })}
              >
                <Trash2 />
                {t('campos.excluir')}
              </Button>
            </div>
          )}
        </div>
        {editando && (
          <form className="grid gap-4" onSubmit={salvar}>
            <CamposDeConfiguracao
              prefixo={campo.id}
              tipo={campo.tipo}
              valor={configuracao}
              aoMudar={(mudanca) => setConfiguracao((atual) => ({ ...atual, ...mudanca }))}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={atualizar.isPending}>
                {t('campos.salvar')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
                {t('campos.cancelar')}
              </Button>
            </div>
          </form>
        )}
        {falha && (
          <p role="alert" className="text-sm text-destructive">
            {falha}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
