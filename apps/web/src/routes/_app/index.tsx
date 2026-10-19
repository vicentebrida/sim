import { useCategoriasListar, useIdeiasListar } from '@sim/api-client';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { NativeSelect } from '@/components/native-select';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { formatarData } from '@/lib/datas';

const STATUS_FILTRAVEIS = [
  'aberta',
  'em_analise',
  'aprovada',
  'em_execucao',
  'concluida',
  'recusada',
  'duplicada',
  'arquivada',
] as const;

const filtrosSchema = z.object({
  status: z.enum(STATUS_FILTRAVEIS).optional().catch(undefined),
  categoriaId: z.string().optional().catch(undefined),
  minhas: z.boolean().optional().catch(undefined),
  pagina: z.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/')({
  validateSearch: filtrosSchema,
  component: HomePage,
});

const POR_PAGINA = 20;

function HomePage() {
  const { t } = useTranslation();
  const filtros = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const pagina = filtros.pagina ?? 1;
  const { data: categoriasResposta } = useCategoriasListar();
  const { data } = useIdeiasListar({
    status: filtros.status,
    categoriaId: filtros.categoriaId,
    autor: filtros.minhas ? 'eu' : undefined,
    pagina,
    porPagina: POR_PAGINA,
  });
  const resultado = data?.data;
  const totalDePaginas = resultado ? Math.max(1, Math.ceil(resultado.total / POR_PAGINA)) : 1;

  const filtrar = (mudanca: Partial<z.infer<typeof filtrosSchema>>) =>
    navigate({ search: (atual) => ({ ...atual, ...mudanca, pagina: undefined }) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('home.title')}</h1>
          <p className="text-muted-foreground">{t('home.subtitle')}</p>
        </div>
        <Button asChild>
          <Link to="/ideias/nova">
            <Lightbulb />
            {t('home.newIdea')}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-44 gap-1">
          <Label htmlFor="filtro-status">{t('ideias.filtros.status')}</Label>
          <NativeSelect
            id="filtro-status"
            value={filtros.status ?? ''}
            onChange={(evento) =>
              filtrar({ status: (evento.target.value || undefined) as typeof filtros.status })
            }
          >
            <option value="">{t('ideias.filtros.todos')}</option>
            {STATUS_FILTRAVEIS.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid min-w-44 gap-1">
          <Label htmlFor="filtro-categoria">{t('ideias.filtros.categoria')}</Label>
          <NativeSelect
            id="filtro-categoria"
            value={filtros.categoriaId ?? ''}
            onChange={(evento) => filtrar({ categoriaId: evento.target.value || undefined })}
          >
            <option value="">{t('ideias.filtros.todas')}</option>
            {(categoriasResposta?.data ?? []).map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={Boolean(filtros.minhas)}
            onChange={(evento) => filtrar({ minhas: evento.target.checked || undefined })}
          />
          {t('ideias.filtros.minhas')}
        </label>
      </div>

      {resultado && resultado.itens.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('ideias.vazio')}
          </CardContent>
        </Card>
      )}

      <ul className="space-y-3">
        {resultado?.itens.map((ideia) => (
          <li key={ideia.id}>
            <Link
              to="/ideias/$numero"
              params={{ numero: String(ideia.numero) }}
              className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={ideia.status} />
                <span className="text-sm text-muted-foreground">#{ideia.numero}</span>
                <span className="text-sm text-muted-foreground">· {ideia.categoria.nome}</span>
              </div>
              <h2 className="mt-2 font-medium">{ideia.titulo}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('ideias.por', { nome: ideia.autor.nome })} ·{' '}
                {ideia.publicadaEm
                  ? t('ideias.publicadaEm', { data: formatarData(ideia.publicadaEm) })
                  : t('ideias.criadaEm', { data: formatarData(ideia.criadaEm) })}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {resultado && totalDePaginas > 1 && (
        <nav className="flex items-center justify-center gap-4" aria-label="Paginação">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            onClick={() => navigate({ search: (atual) => ({ ...atual, pagina: pagina - 1 }) })}
          >
            {t('ideias.anterior')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('ideias.pagina', { pagina, total: totalDePaginas })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= totalDePaginas}
            onClick={() => navigate({ search: (atual) => ({ ...atual, pagina: pagina + 1 }) })}
          >
            {t('ideias.proxima')}
          </Button>
        </nav>
      )}
    </div>
  );
}
