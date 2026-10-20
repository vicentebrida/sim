import { attachmentsAddToIdea, ideasCreate } from '@sim/api-client';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type IdeaData, IdeaForm } from '@/components/idea-form';
import { uploadAll } from '@/lib/uploads';
import { useStatusInfo } from '@/lib/use-statuses';

export const Route = createFileRoute('/_app/ideas/new')({ component: NewIdeaPage });

function NewIdeaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const drafts = useStatusInfo().enabled('draft');

  async function create(data: IdeaData, files: File[], publish: boolean) {
    const { data: idea } = await ideasCreate({ ...data, publish });
    const failed = await uploadAll(files, (file) => attachmentsAddToIdea(idea.number, { file }));
    const params = { number: String(idea.number) };
    // The Idea exists already; if a file failed, the Author retries from the edit page.
    if (failed) await navigate({ to: '/ideas/$number/edit', params, search: { failed } });
    else await navigate({ to: '/ideas/$number', params });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('ideas.new')}</h1>
      <IdeaForm
        actions={[
          {
            label: t('ideas.publish'),
            enforceRequired: true,
            run: (d, files) => create(d, files, true),
          },
          ...(drafts
            ? [
                {
                  label: t('ideas.saveDraft'),
                  variant: 'outline' as const,
                  enforceRequired: false,
                  run: (d: IdeaData, files: File[]) => create(d, files, false),
                },
              ]
            : []),
        ]}
        onCancel={() => navigate({ to: '/' })}
      />
    </div>
  );
}
