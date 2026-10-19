import { getIdeiasDetalharQueryKey, ideiasEditar, useIdeiasDetalhar } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type DadosDaIdeia, IdeiaForm } from '@/components/ideia-form';

export const Route = createFileRoute('/_app/ideias/$numero/editar')({ component: EditarIdeiaPage });

function EditarIdeiaPage() {
  const { t } = useTranslation();
  const { numero } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useIdeiasDetalhar(Number(numero));
  const ideia = data?.data;
  if (!ideia) return null;

  const voltar = () => navigate({ to: '/ideias/$numero', params: { numero } });
  async function salvar(dados: DadosDaIdeia) {
    await ideiasEditar(Number(numero), dados);
    await queryClient.invalidateQueries({ queryKey: getIdeiasDetalharQueryKey(Number(numero)) });
    await voltar();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('ideias.editar')}</h1>
      <IdeiaForm
        inicial={{ titulo: ideia.titulo, categoriaId: ideia.categoria.id, valores: ideia.valores }}
        acoes={[
          {
            rotulo: t('ideias.salvar'),
            // Ideia publicada continua precisando dos obrigatórios; Rascunho não.
            exigirObrigatorios: ideia.status !== 'rascunho',
            executar: salvar,
          },
        ]}
        aoCancelar={voltar}
      />
    </div>
  );
}
