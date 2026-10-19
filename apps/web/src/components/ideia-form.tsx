import {
  ApiError,
  type CampoPersonalizadoDtoOutput,
  useCamposPersonalizadosListar,
  useCategoriasListar,
} from '@sim/api-client';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type ValorDeCampo = string | number | boolean | string[] | null;

export interface DadosDaIdeia {
  titulo: string;
  categoriaId: string;
  valores: Record<string, ValorDeCampo>;
}

export interface AcaoDoFormulario {
  rotulo: string;
  variante?: 'default' | 'outline';
  /** Publicar exige os campos obrigatórios; salvar Rascunho não. */
  exigirObrigatorios: boolean;
  executar: (dados: DadosDaIdeia) => Promise<unknown>;
}

function vazio(valor: ValorDeCampo | undefined) {
  return (
    valor === null ||
    valor === undefined ||
    (typeof valor === 'string' && !valor.trim()) ||
    (Array.isArray(valor) && valor.length === 0) ||
    (typeof valor === 'number' && Number.isNaN(valor))
  );
}

/** Remove valores vazios antes de enviar (a API também os descarta). */
function limpar(valores: Record<string, ValorDeCampo>) {
  return Object.fromEntries(Object.entries(valores).filter(([, valor]) => !vazio(valor)));
}

export function IdeiaForm({
  inicial,
  acoes,
  aoCancelar,
}: {
  inicial?: DadosDaIdeia;
  acoes: AcaoDoFormulario[];
  aoCancelar?: () => void;
}) {
  const { t } = useTranslation();
  const { data: categoriasResposta } = useCategoriasListar();
  const { data: camposResposta } = useCamposPersonalizadosListar();
  const categorias = categoriasResposta?.data ?? [];
  const campos = camposResposta?.data ?? [];
  const [executando, setExecutando] = useState<string>();
  const [falhaGeral, setFalhaGeral] = useState<string>();

  const form = useForm<DadosDaIdeia>({
    defaultValues: inicial ?? { titulo: '', categoriaId: '', valores: {} },
  });
  const { errors } = form.formState;
  const categoriaId = useWatch({ control: form.control, name: 'categoriaId' });
  const categoriaEscolhida = categorias.find((c) => c.id === categoriaId);

  function validar(dados: DadosDaIdeia, exigirObrigatorios: boolean) {
    let valido = true;
    const erro = (nome: Parameters<typeof form.setError>[0]) => {
      form.setError(nome, { message: t('ideias.obrigatorio') });
      valido = false;
    };
    if (!dados.titulo.trim()) erro('titulo');
    if (!dados.categoriaId) erro('categoriaId');
    if (exigirObrigatorios) {
      for (const campo of campos) {
        if (campo.obrigatorio && vazio(dados.valores?.[campo.id])) erro(`valores.${campo.id}`);
      }
    }
    return valido;
  }

  async function enviar(acao: AcaoDoFormulario) {
    form.clearErrors();
    setFalhaGeral(undefined);
    const dados = form.getValues();
    if (!validar(dados, acao.exigirObrigatorios)) return;
    setExecutando(acao.rotulo);
    try {
      await acao.executar({
        ...dados,
        titulo: dados.titulo.trim(),
        valores: limpar(dados.valores ?? {}),
      });
    } catch (erro) {
      const corpo =
        erro instanceof ApiError
          ? (erro.body as { codigo?: string; detalhes?: Record<string, string> })
          : undefined;
      if (corpo?.codigo === 'CAMPOS_INVALIDOS' && corpo.detalhes) {
        for (const [campoId, mensagem] of Object.entries(corpo.detalhes)) {
          form.setError(`valores.${campoId}`, { message: mensagem });
        }
        setFalhaGeral(t('ideias.camposInvalidos'));
      } else {
        setFalhaGeral(t('erros.generico'));
      }
    } finally {
      setExecutando(undefined);
    }
  }

  return (
    <form className="grid gap-6" noValidate onSubmit={(evento) => evento.preventDefault()}>
      <FormField
        id="titulo"
        label={t('ideias.titulo')}
        maxLength={120}
        placeholder={t('ideias.tituloAjuda')}
        error={errors.titulo?.message}
        {...form.register('titulo')}
      />

      <div className="grid gap-2">
        <Label htmlFor="categoriaId">{t('ideias.categoria')}</Label>
        <NativeSelect
          id="categoriaId"
          aria-invalid={Boolean(errors.categoriaId)}
          {...form.register('categoriaId')}
        >
          <option value="">{t('ideias.escolhaCategoria')}</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </NativeSelect>
        {categoriaEscolhida?.descricao && (
          <p className="text-sm text-muted-foreground">{categoriaEscolhida.descricao}</p>
        )}
        {errors.categoriaId && (
          <p className="text-sm text-destructive">{errors.categoriaId.message}</p>
        )}
      </div>

      {campos.map((campo) => (
        <CampoDinamico
          key={campo.id}
          campo={campo}
          form={form}
          erro={errors.valores?.[campo.id]?.message}
        />
      ))}

      {falhaGeral && (
        <p role="alert" className="text-sm text-destructive">
          {falhaGeral}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {acoes.map((acao) => (
          <Button
            key={acao.rotulo}
            type="button"
            variant={acao.variante ?? 'default'}
            disabled={Boolean(executando)}
            onClick={() => enviar(acao)}
          >
            {acao.rotulo}
          </Button>
        ))}
        {aoCancelar && (
          <Button type="button" variant="ghost" onClick={aoCancelar}>
            {t('ideias.cancelar')}
          </Button>
        )}
      </div>
    </form>
  );
}

function CampoDinamico({
  campo,
  form,
  erro,
}: {
  campo: CampoPersonalizadoDtoOutput;
  form: ReturnType<typeof useForm<DadosDaIdeia>>;
  erro?: string;
}) {
  const { t } = useTranslation();
  const id = `campo-${campo.id}`;
  const nome = `valores.${campo.id}` as const;
  const rotulo = `${campo.rotulo}${campo.obrigatorio ? ' *' : ''}`;
  const descricao = [campo.ajuda && `${id}-ajuda`, erro && `${id}-erro`].filter(Boolean).join(' ');
  const comuns = {
    'aria-invalid': Boolean(erro),
    'aria-describedby': descricao || undefined,
  };

  let controle;
  switch (campo.tipo) {
    case 'texto_curto':
      controle = <Input id={id} maxLength={200} {...comuns} {...form.register(nome)} />;
      break;
    case 'texto_longo':
      controle = (
        <Textarea id={id} rows={4} maxLength={10_000} {...comuns} {...form.register(nome)} />
      );
      break;
    case 'numero':
      controle = (
        <Input
          id={id}
          type="number"
          step="any"
          {...comuns}
          {...form.register(nome, { setValueAs: (v: string) => (v === '' ? null : Number(v)) })}
        />
      );
      break;
    case 'selecao_unica':
      controle = (
        <NativeSelect id={id} {...comuns} {...form.register(nome)}>
          <option value="" />
          {campo.opcoes.map((opcao) => (
            <option key={opcao}>{opcao}</option>
          ))}
        </NativeSelect>
      );
      break;
    case 'selecao_multipla':
      return (
        <fieldset className="grid gap-2" {...comuns}>
          <legend className="mb-2 text-sm font-medium">{rotulo}</legend>
          <Ajuda id={id} campo={campo} />
          <Controller
            control={form.control}
            name={nome}
            render={({ field }) => {
              const marcadas = Array.isArray(field.value) ? field.value : [];
              return (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {campo.opcoes.map((opcao) => (
                    <label key={opcao} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={marcadas.includes(opcao)}
                        onChange={(evento) =>
                          field.onChange(
                            evento.target.checked
                              ? [...marcadas, opcao]
                              : marcadas.filter((m) => m !== opcao),
                          )
                        }
                      />
                      {opcao}
                    </label>
                  ))}
                </div>
              );
            }}
          />
          <Erro id={id} erro={erro} />
        </fieldset>
      );
    case 'sim_nao':
      return (
        <fieldset className="grid gap-2" {...comuns}>
          <legend className="mb-2 text-sm font-medium">{rotulo}</legend>
          <Ajuda id={id} campo={campo} />
          <Controller
            control={form.control}
            name={nome}
            render={({ field }) => (
              <div className="flex gap-4">
                {[true, false].map((opcao) => (
                  <label key={String(opcao)} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={field.name}
                      className="size-4"
                      checked={field.value === opcao}
                      onChange={() => field.onChange(opcao)}
                    />
                    {opcao ? t('ideias.sim') : t('ideias.nao')}
                  </label>
                ))}
              </div>
            )}
          />
          <Erro id={id} erro={erro} />
        </fieldset>
      );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {controle}
      <Ajuda id={id} campo={campo} />
      <Erro id={id} erro={erro} />
    </div>
  );
}

function Ajuda({ id, campo }: { id: string; campo: CampoPersonalizadoDtoOutput }) {
  if (!campo.ajuda) return null;
  return (
    <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
      {campo.ajuda}
    </p>
  );
}

function Erro({ id, erro }: { id: string; erro?: string }) {
  if (!erro) return null;
  return (
    <p id={`${id}-erro`} className="text-sm text-destructive">
      {erro}
    </p>
  );
}
