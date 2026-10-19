import { getIdeasDetailQueryKey, ideasUpdate, useIdeasDetail } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type IdeaData, IdeaForm } from '@/components/idea-form';

export const Route = createFileRoute('/_app/ideas/$number/edit')({ component: EditIdeaPage });

function EditIdeaPage() {
  const { t } = useTranslation();
  const { number } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useIdeasDetail(Number(number));
  const idea = data?.data;
  if (!idea) return null;

  const back = () => navigate({ to: '/ideas/$number', params: { number } });
  async function save(changes: IdeaData) {
    await ideasUpdate(Number(number), changes);
    await queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(Number(number)) });
    await back();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('ideas.edit')}</h1>
      <IdeaForm
        initial={{ title: idea.title, categoryId: idea.category.id, values: idea.values }}
        ideaNumber={idea.number}
        actions={[
          {
            label: t('ideas.save'),
            // A published Idea still needs its required fields; a Draft does not.
            enforceRequired: idea.status !== 'draft',
            run: save,
          },
        ]}
        onCancel={back}
      />
    </div>
  );
}
