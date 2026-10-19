import {
  ApiError,
  type AttachmentDtoOutput,
  type CustomFieldDtoOutput,
  useCategoriesList,
  useCustomFieldsList,
  useSettingsGet,
} from '@sim/api-client';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AttachmentList, FilePicker } from '@/components/attachments';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { SimilarIdeas } from '@/components/similar-ideas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AttachmentsNotSent } from '@/lib/uploads';
import { detectionText } from '@/lib/detection-text';
import { useFilesProblem } from '@/lib/attachments';
import { apiErrorMessage } from '@/lib/errors';

export type FieldValue = string | number | boolean | string[] | null;

export interface IdeaData {
  title: string;
  categoryId: string;
  values: Record<string, FieldValue>;
  /** Show as anonymous (when the installation allows it). */
  hiddenAuthorship?: boolean;
}

export interface FormAction {
  label: string;
  variant?: 'default' | 'outline';
  /** Publishing enforces the required fields; saving a Draft does not. */
  enforceRequired: boolean;
  run: (data: IdeaData, files: File[]) => Promise<unknown>;
}

function isEmpty(value: FieldValue | undefined) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'number' && Number.isNaN(value))
  );
}

/** Drops empty values before sending (the API drops them too). */
function clean(values: Record<string, FieldValue>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isEmpty(value)));
}

export function IdeaForm({
  initial,
  actions,
  onCancel,
  ideaNumber,
  existingAttachments = [],
  onRemoveAttachment,
}: {
  initial?: IdeaData;
  actions: FormAction[];
  onCancel?: () => void;
  /** Number of the Idea being edited, left out of the Similar Ideas. */
  ideaNumber?: number;
  /** Files the Idea already has (editing). */
  existingAttachments?: AttachmentDtoOutput[];
  onRemoveAttachment?: (attachment: AttachmentDtoOutput) => void;
}) {
  const { t } = useTranslation();
  const { data: categoriesResponse } = useCategoriesList();
  const { data: fieldsResponse } = useCustomFieldsList();
  const { data: settings } = useSettingsGet();
  // Offered when the installation allows it, or to let the Author undo it.
  const canHide = settings?.data.hiddenAuthorshipEnabled || initial?.hiddenAuthorship;
  const categories = categoriesResponse?.data ?? [];
  const fields = fieldsResponse?.data ?? [];
  const [running, setRunning] = useState<string>();
  const [generalError, setGeneralError] = useState<string>();
  const [files, setFiles] = useState<File[]>([]);
  const filesProblem = useFilesProblem(files, existingAttachments.length);

  const form = useForm<IdeaData>({
    defaultValues: initial ?? { title: '', categoryId: '', values: {}, hiddenAuthorship: false },
  });
  const { errors } = form.formState;
  const categoryId = useWatch({ control: form.control, name: 'categoryId' });
  const title = useWatch({ control: form.control, name: 'title' });
  const values = useWatch({ control: form.control, name: 'values' });
  const chosenCategory = categories.find((c) => c.id === categoryId);

  function validate(data: IdeaData, enforceRequired: boolean) {
    let valid = true;
    const fail = (name: Parameters<typeof form.setError>[0]) => {
      form.setError(name, { message: t('errors.required') });
      valid = false;
    };
    if (!data.title.trim()) fail('title');
    if (!data.categoryId) fail('categoryId');
    if (enforceRequired) {
      for (const field of fields) {
        if (field.required && isEmpty(data.values?.[field.id])) fail(`values.${field.id}`);
      }
    }
    return valid;
  }

  async function submit(action: FormAction) {
    form.clearErrors();
    setGeneralError(undefined);
    const data = form.getValues();
    if (!validate(data, action.enforceRequired) || filesProblem) return;
    setRunning(action.label);
    try {
      await action.run(
        { ...data, title: data.title.trim(), values: clean(data.values ?? {}) },
        files,
      );
    } catch (error) {
      const body =
        error instanceof ApiError
          ? (error.body as { code?: string; details?: Record<string, string> })
          : undefined;
      if (body?.code === 'INVALID_FIELDS' && body.details) {
        for (const [fieldId, problem] of Object.entries(body.details)) {
          form.setError(`values.${fieldId}`, { message: t(`errors.fields.${problem}`) });
        }
      }
      setGeneralError(
        error instanceof AttachmentsNotSent ? t('attachments.failed') : apiErrorMessage(error, t),
      );
    } finally {
      setRunning(undefined);
    }
  }

  return (
    <form className="grid gap-6" noValidate onSubmit={(event) => event.preventDefault()}>
      <FormField
        id="title"
        label={t('ideas.title')}
        maxLength={120}
        placeholder={t('ideas.titleHelp')}
        error={errors.title?.message}
        {...form.register('title')}
      />
      <SimilarIdeas
        title={title ?? ''}
        text={detectionText(fields, values ?? {})}
        exclude={ideaNumber}
      />

      <div className="grid gap-2">
        <Label htmlFor="categoryId">{t('ideas.category')}</Label>
        <NativeSelect
          id="categoryId"
          aria-invalid={Boolean(errors.categoryId)}
          {...form.register('categoryId')}
        >
          <option value="">{t('ideas.chooseCategory')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </NativeSelect>
        {chosenCategory?.description && (
          <p className="text-sm text-muted-foreground">{chosenCategory.description}</p>
        )}
        {errors.categoryId && (
          <p className="text-sm text-destructive">{errors.categoryId.message}</p>
        )}
      </div>

      {fields.map((field) => (
        <DynamicField
          key={field.id}
          field={field}
          form={form}
          error={errors.values?.[field.id]?.message}
        />
      ))}

      {canHide && (
        <div className="grid gap-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4" {...form.register('hiddenAuthorship')} />
            {t('authorship.hide')}
          </label>
          <p className="text-sm text-muted-foreground">{t('authorship.hideHelp')}</p>
        </div>
      )}

      <div className="grid gap-2">
        <Label>{t('attachments.title')}</Label>
        <AttachmentList attachments={existingAttachments} onRemove={onRemoveAttachment} />
        <FilePicker files={files} onChange={setFiles} existing={existingAttachments.length} />
      </div>

      {generalError && (
        <p role="alert" className="text-sm text-destructive">
          {generalError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant={action.variant ?? 'default'}
            disabled={Boolean(running)}
            onClick={() => submit(action)}
          >
            {action.label}
          </Button>
        ))}
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('ideas.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}

function DynamicField({
  field,
  form,
  error,
}: {
  field: CustomFieldDtoOutput;
  form: ReturnType<typeof useForm<IdeaData>>;
  error?: string;
}) {
  const { t } = useTranslation();
  const id = `field-${field.id}`;
  const name = `values.${field.id}` as const;
  const label = `${field.label}${field.required ? ' *' : ''}`;
  const describedBy = [field.help && `${id}-help`, error && `${id}-error`]
    .filter(Boolean)
    .join(' ');
  const common = {
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy || undefined,
  };

  let control;
  switch (field.type) {
    case 'short_text':
      control = <Input id={id} maxLength={200} {...common} {...form.register(name)} />;
      break;
    case 'long_text':
      control = (
        <Textarea id={id} rows={4} maxLength={10_000} {...common} {...form.register(name)} />
      );
      break;
    case 'number':
      control = (
        <Input
          id={id}
          type="number"
          step="any"
          {...common}
          {...form.register(name, { setValueAs: (v: string) => (v === '' ? null : Number(v)) })}
        />
      );
      break;
    case 'single_choice':
      control = (
        <NativeSelect id={id} {...common} {...form.register(name)}>
          <option value="" />
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </NativeSelect>
      );
      break;
    case 'multiple_choice':
      return (
        <fieldset className="grid gap-2" {...common}>
          <legend className="mb-2 text-sm font-medium">{label}</legend>
          <Help id={id} field={field} />
          <Controller
            control={form.control}
            name={name}
            render={({ field: control }) => {
              const checked = Array.isArray(control.value) ? control.value : [];
              return (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {field.options.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={checked.includes(option)}
                        onChange={(event) =>
                          control.onChange(
                            event.target.checked
                              ? [...checked, option]
                              : checked.filter((c) => c !== option),
                          )
                        }
                      />
                      {option}
                    </label>
                  ))}
                </div>
              );
            }}
          />
          <FieldError id={id} error={error} />
        </fieldset>
      );
    case 'yes_no':
      return (
        <fieldset className="grid gap-2" {...common}>
          <legend className="mb-2 text-sm font-medium">{label}</legend>
          <Help id={id} field={field} />
          <Controller
            control={form.control}
            name={name}
            render={({ field: control }) => (
              <div className="flex gap-4">
                {[true, false].map((option) => (
                  <label key={String(option)} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={control.name}
                      className="size-4"
                      checked={control.value === option}
                      onChange={() => control.onChange(option)}
                    />
                    {option ? t('ideas.yes') : t('ideas.no')}
                  </label>
                ))}
              </div>
            )}
          />
          <FieldError id={id} error={error} />
        </fieldset>
      );
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {control}
      <Help id={id} field={field} />
      <FieldError id={id} error={error} />
    </div>
  );
}

function Help({ id, field }: { id: string; field: CustomFieldDtoOutput }) {
  if (!field.help) return null;
  return (
    <p id={`${id}-help`} className="text-sm text-muted-foreground">
      {field.help}
    </p>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="text-sm text-destructive">
      {error}
    </p>
  );
}
