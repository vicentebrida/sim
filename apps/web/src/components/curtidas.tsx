import {
  getIdeiasDetalharQueryKey,
  getIdeiasListarCurtidasQueryKey,
  getIdeiasListarQueryKey,
  type IdeiaDtoOutput,
  useIdeiasCurtir,
  useIdeiasDescurtir,
  useIdeiasListarCurtidas,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Contador de Curtidas da lista; destacado quando o Colaborador atual curtiu. */
export function ContadorDeCurtidas({ total, curtiu }: { total: number; curtiu: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-sm',
        curtiu ? 'font-medium text-primary' : 'text-muted-foreground',
      )}
      title={curtiu ? t('curtidas.voceCurtiu') : undefined}
    >
      <ThumbsUp className={cn('size-4', curtiu && 'fill-current')} aria-hidden />
      {t('curtidas.total', { count: total })}
    </span>
  );
}

/** Botão de curtir da página da Ideia, com a lista de quem curtiu. */
export function Curtidas({ ideia }: { ideia: IdeiaDtoOutput }) {
  const { t } = useTranslation();
  const { colaborador } = useRouteContext({ from: '/_app' });
  const queryClient = useQueryClient();
  const [mostrandoQuem, setMostrandoQuem] = useState(false);
  const { total, curtiu } = ideia.curtidas;

  const atualizar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getIdeiasDetalharQueryKey(ideia.numero) }),
      queryClient.invalidateQueries({ queryKey: getIdeiasListarQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getIdeiasListarCurtidasQueryKey(ideia.numero) }),
    ]);
  };
  const curtir = useIdeiasCurtir({ mutation: { onSuccess: atualizar } });
  const descurtir = useIdeiasDescurtir({ mutation: { onSuccess: atualizar } });
  const enviando = curtir.isPending || descurtir.isPending;

  const motivo =
    ideia.autor.id === colaborador.id ? t('curtidas.proprioAutor') : t('curtidas.congeladas');

  return (
    <section className="space-y-2" aria-label={t('curtidas.total', { count: total })}>
      <div className="flex flex-wrap items-center gap-3">
        {ideia.permissoes.podeCurtir ? (
          <Button
            variant={curtiu ? 'default' : 'outline'}
            aria-pressed={curtiu}
            disabled={enviando}
            title={t('curtidas.curtirAjuda')}
            onClick={() =>
              curtiu
                ? descurtir.mutate({ numero: ideia.numero })
                : curtir.mutate({ numero: ideia.numero })
            }
          >
            <ThumbsUp className={cn(curtiu && 'fill-current')} />
            {curtiu ? t('curtidas.curtida') : t('curtidas.curtir')}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{motivo}</p>
        )}
        <ContadorDeCurtidas total={total} curtiu={curtiu} />
        {total > 0 && (
          <Button
            variant="link"
            size="sm"
            className="px-0"
            aria-expanded={mostrandoQuem}
            onClick={() => setMostrandoQuem((atual) => !atual)}
          >
            {mostrandoQuem ? t('curtidas.ocultarQuem') : t('curtidas.verQuem')}
          </Button>
        )}
      </div>
      {mostrandoQuem && <QuemCurtiu numero={ideia.numero} />}
    </section>
  );
}

function QuemCurtiu({ numero }: { numero: number }) {
  const { t } = useTranslation();
  const { data } = useIdeiasListarCurtidas(numero);
  const curtidas = data?.data;
  if (!curtidas) return null;
  if (!curtidas.length) {
    return <p className="text-sm text-muted-foreground">{t('curtidas.ninguem')}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('curtidas.verQuem')}>
      {curtidas.map(({ colaborador }) => (
        <li key={colaborador.id} className="rounded-full bg-muted px-3 py-1 text-sm">
          {colaborador.nome}
        </li>
      ))}
    </ul>
  );
}
