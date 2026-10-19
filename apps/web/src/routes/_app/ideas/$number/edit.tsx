import {
  attachmentsAddToIdea,
  getIdeasDetailQueryKey,
  ideasUpdate,
  useAttachmentsRemove,
  useIdeasDetail,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type IdeaData, IdeaForm } from '@/components/idea-form';
import { AttachmentsNotSent, uploadAll } from '@/lib/uploads';

export const Route = createFileRoute('/_app/ideas/$number/edit')({
  component: EditIdeaPage,
  // Set by the new Idea page when some file could not be sent.
  validateSearch: (search: Record<string, unknown>) => ({
    failed: Number(search.failed) || undefined,
  }),
});

function EditIdeaPage() {
  const { t } = useTranslation();
  const { number } = Route.useParams();
  const { failed } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useIdeasDetail(Number(number));
  const idea = data?.data;
  const reload = () =>
    queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(Number(number)) });
  const remove = useAttachmentsRemove({ mutation: { onSuccess: reload } });
  if (!idea) return null;

  const back = () => navigate({ to: '/ideas/$number', params: { number } });
  async function save(changes: IdeaData, files: File[]) {
    await ideasUpdate(Number(number), changes);
    const notSent = await uploadAll(files, (file) =>
      attachmentsAddToIdea(Number(number), { file }),
    );
    if (notSent) {
      await reload();
      throw new AttachmentsNotSent();
    }
    await queryClient.invalidateQueries({ queryKey: getIdeasDetailQueryKey(Number(number)) });
    await back();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('ideas.edit')}</h1>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('attachments.failed')}
        </p>
      )}
      <IdeaForm
        initial={{
          title: idea.title,
          categoryId: idea.category.id,
          values: idea.values,
          hiddenAuthorship: idea.hiddenAuthorship,
        }}
        ideaNumber={idea.number}
        existingAttachments={idea.attachments}
        onRemoveAttachment={(attachment) => remove.mutate({ id: attachment.id })}
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
