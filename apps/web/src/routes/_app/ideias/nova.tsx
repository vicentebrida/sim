import { ideiasCriar } from '@sim/api-client';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type DadosDaIdeia, IdeiaForm } from '@/components/ideia-form';

export const Route = createFileRoute('/_app/ideias/nova')({ component: NovaIdeiaPage });

function NovaIdeiaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  async function criar(dados: DadosDaIdeia, publicar: boolean) {
    const { data } = await ideiasCriar({ ...dados, publicar });
    await navigate({ to: '/ideias/$numero', params: { numero: String(data.numero) } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('ideias.nova')}</h1>
      <IdeiaForm
        acoes={[
          {
            rotulo: t('ideias.publicar'),
            exigirObrigatorios: true,
            executar: (d) => criar(d, true),
          },
          {
            rotulo: t('ideias.salvarRascunho'),
            variante: 'outline',
            exigirObrigatorios: false,
            executar: (d) => criar(d, false),
          },
        ]}
        aoCancelar={() => navigate({ to: '/' })}
      />
    </div>
  );
}
