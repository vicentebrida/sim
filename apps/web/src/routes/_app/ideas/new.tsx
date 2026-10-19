import { ideasCreate } from '@sim/api-client';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type IdeaData, IdeaForm } from '@/components/idea-form';

export const Route = createFileRoute('/_app/ideas/new')({ component: NewIdeaPage });

function NewIdeaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  async function create(data: IdeaData, publish: boolean) {
    const { data: idea } = await ideasCreate({ ...data, publish });
    await navigate({ to: '/ideas/$number', params: { number: String(idea.number) } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('ideas.new')}</h1>
      <IdeaForm
        actions={[
          { label: t('ideas.publish'), enforceRequired: true, run: (d) => create(d, true) },
          {
            label: t('ideas.saveDraft'),
            variant: 'outline',
            enforceRequired: false,
            run: (d) => create(d, false),
          },
        ]}
        onCancel={() => navigate({ to: '/' })}
      />
    </div>
  );
}
