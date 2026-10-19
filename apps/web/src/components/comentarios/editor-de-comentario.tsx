import { useMencionaveisBuscar } from '@sim/api-client';
import {
  type FormEvent,
  type KeyboardEvent,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type Mencionado, paraEdicao, paraEnvio } from '@/lib/mencoes';
import { cn } from '@/lib/utils';

// "@" no começo ou depois de espaço, seguido do que já foi digitado do nome, até o cursor.
const MENCAO_EM_ANDAMENTO = /(?:^|\s)@([\p{L}\p{N}._-]{0,40})$/u;

interface Props {
  rotulo: string;
  rotuloEnviar: string;
  /** Texto inicial com marcação de Menções (edição). */
  inicial?: string;
  enviando: boolean;
  erro?: string;
  /** Rejeita em caso de erro, para o texto digitado não se perder. */
  aoEnviar: (texto: string) => Promise<unknown>;
  aoCancelar?: () => void;
  autoFocus?: boolean;
}

export function EditorDeComentario({
  rotulo,
  rotuloEnviar,
  inicial = '',
  enviando,
  erro,
  aoEnviar,
  aoCancelar,
  autoFocus,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const cursorPendente = useRef<number | null>(null);
  const [estadoInicial] = useState(() => paraEdicao(inicial));
  const [texto, setTexto] = useState(estadoInicial.texto);
  const [mencionados, setMencionados] = useState<Mencionado[]>(estadoInicial.mencionados);
  const [consulta, setConsulta] = useState<string | null>(null);
  const [destaque, setDestaque] = useState(0);
  const busca = useDeferredValue(consulta);

  const { data } = useMencionaveisBuscar(
    { busca: busca ?? '' },
    { query: { enabled: busca !== null, staleTime: 30_000 } },
  );
  const sugestoes = consulta !== null ? (data?.data ?? []) : [];
  const aberta = sugestoes.length > 0;

  function acompanharCursor(valor: string, cursor: number) {
    const mencao = MENCAO_EM_ANDAMENTO.exec(valor.slice(0, cursor));
    setConsulta(mencao ? mencao[1]! : null);
    setDestaque(0);
  }

  function escolher(pessoa: Mencionado) {
    const cursor = textarea.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor).replace(/@[\p{L}\p{N}._-]*$/u, `@${pessoa.nome} `);
    const novo = antes + texto.slice(cursor);
    setTexto(novo);
    setMencionados((atuais) => [...atuais.filter((m) => m.id !== pessoa.id), pessoa]);
    setConsulta(null);
    cursorPendente.current = antes.length;
  }

  // Depois de inserir a Menção, o cursor vai para logo depois dela (antes da próxima tecla).
  useLayoutEffect(() => {
    if (cursorPendente.current === null) return;
    textarea.current?.focus();
    textarea.current?.setSelectionRange(cursorPendente.current, cursorPendente.current);
    cursorPendente.current = null;
  }, [texto]);

  function teclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (!aberta) return;
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      const passo = evento.key === 'ArrowDown' ? 1 : -1;
      setDestaque((atual) => (atual + passo + sugestoes.length) % sugestoes.length);
    } else if (evento.key === 'Enter' || evento.key === 'Tab') {
      evento.preventDefault();
      escolher(sugestoes[destaque]!);
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      setConsulta(null);
    }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!texto.trim()) return;
    try {
      await aoEnviar(paraEnvio(texto.trim(), mencionados));
      setTexto('');
      setMencionados([]);
    } catch {
      // O erro chega pela prop `erro`; o texto fica para a pessoa tentar de novo.
    }
  }

  const listaId = `${id}-sugestoes`;
  return (
    <form className="grid gap-2" onSubmit={enviar}>
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <div className="relative">
        <Textarea
          id={id}
          ref={textarea}
          rows={3}
          value={texto}
          placeholder={rotulo}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={aberta}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={aberta ? `${listaId}-${destaque}` : undefined}
          onChange={(evento) => {
            setTexto(evento.target.value);
            acompanharCursor(evento.target.value, evento.target.selectionStart);
          }}
          onKeyDown={teclar}
          onBlur={() => setConsulta(null)}
        />
        <ul
          id={listaId}
          role="listbox"
          aria-label={t('comentarios.sugestoes')}
          hidden={!aberta}
          className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border bg-popover p-1 shadow-md"
        >
          {sugestoes.map((pessoa, indice) => (
            <li
              key={pessoa.id}
              id={`${listaId}-${indice}`}
              role="option"
              aria-selected={indice === destaque}
              className={cn(
                'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                indice === destaque && 'bg-accent text-accent-foreground',
              )}
              // mousedown, não click: o clique tiraria o foco do campo e fecharia a lista antes.
              onMouseDown={(evento) => {
                evento.preventDefault();
                escolher(pessoa);
              }}
            >
              {pessoa.nome}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">{t('comentarios.ajudaMencao')}</p>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!texto.trim() || enviando}>
          {rotuloEnviar}
        </Button>
        {aoCancelar && (
          <Button type="button" size="sm" variant="ghost" onClick={aoCancelar}>
            {t('comentarios.cancelar')}
          </Button>
        )}
      </div>
    </form>
  );
}
