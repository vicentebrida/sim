import {
  type CustomFieldDtoOutput,
  type CustomFieldDtoOutputType,
  getCustomFieldsListQueryKey,
  useCategoriesList,
  useCustomFieldsCreate,
  useCustomFieldsDelete,
  useCustomFieldsList,
  useCustomFieldsReorder,
  useCustomFieldsUpdate,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/custom-fields')({ component: CustomFieldsPage });

const TYPES: CustomFieldDtoOutputType[] = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'number',
  'yes_no',
];
const WITH_OPTIONS = ['single_choice', 'multiple_choice'];
const TEXT_TYPES = ['short_text', 'long_text'];
const PARAMS = { includeInactive: 'true' };

function useReloadFields() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getCustomFieldsListQueryKey() });
}

function CustomFieldsPage() {
  const { t } = useTranslation();
  const { data } = useCustomFieldsList(PARAMS);
  const fields = data?.data ?? [];
  const reload = useReloadFields();
  const reorder = useCustomFieldsReorder({ mutation: { onSuccess: reload } });

  function move(index: number, direction: -1 | 1) {
    const ids = fields.map((field) => field.id);
    const target = index + direction;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate({ data: { ids } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('fields.title')}</h1>
        <p className="text-muted-foreground">{t('fields.subtitle')}</p>
      </div>
      <NewField />
      <ol className="space-y-3">
        {fields.map((field, index) => (
          <li key={field.id}>
            <FieldItem
              field={field}
              canMoveUp={index > 0}
              canMoveDown={index < fields.length - 1}
              onMove={(direction) => move(index, direction)}
              moving={reorder.isPending}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface Configuration {
  /** Empty means all Categories. */
  categoryIds: string[];
  label: string;
  help: string;
  required: boolean;
  optionsText: string;
  useForDetection: boolean;
}

const optionsFromText = (text: string) => [
  ...new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  ),
];

function ConfigurationFields({
  prefix,
  type,
  value,
  onChange,
}: {
  prefix: string;
  type: CustomFieldDtoOutputType;
  value: Configuration;
  onChange: (change: Partial<Configuration>) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <FormField
        id={`${prefix}-label`}
        label={t('fields.label')}
        value={value.label}
        maxLength={80}
        onChange={(event) => onChange({ label: event.target.value })}
      />
      <FormField
        id={`${prefix}-help`}
        label={t('fields.help')}
        value={value.help}
        maxLength={280}
        onChange={(event) => onChange({ help: event.target.value })}
      />
      {WITH_OPTIONS.includes(type) && (
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-options`}>{t('fields.options')}</Label>
          <Textarea
            id={`${prefix}-options`}
            rows={4}
            value={value.optionsText}
            onChange={(event) => onChange({ optionsText: event.target.value })}
          />
        </div>
      )}
      <CategoryScope
        prefix={prefix}
        selected={value.categoryIds}
        onChange={(categoryIds) => onChange({ categoryIds })}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={value.required}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        {t('fields.required')}
      </label>
      {TEXT_TYPES.includes(type) && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={value.useForDetection}
            onChange={(event) => onChange({ useForDetection: event.target.checked })}
          />
          {t('fields.useForDetection')}
        </label>
      )}
    </>
  );
}

const EMPTY_CONFIGURATION: Configuration = {
  categoryIds: [],
  label: '',
  help: '',
  required: false,
  optionsText: '',
  useForDetection: false,
};

function NewField() {
  const { t } = useTranslation();
  const reload = useReloadFields();
  const [type, setType] = useState<CustomFieldDtoOutputType>('long_text');
  const [configuration, setConfiguration] = useState(EMPTY_CONFIGURATION);
  const create = useCustomFieldsCreate({
    mutation: {
      onSuccess: async () => {
        setConfiguration(EMPTY_CONFIGURATION);
        await reload();
      },
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({
      data: {
        label: configuration.label,
        help: configuration.help,
        type,
        required: configuration.required,
        options: WITH_OPTIONS.includes(type) ? optionsFromText(configuration.optionsText) : [],
        useForDetection: TEXT_TYPES.includes(type) && configuration.useForDetection,
        categoryIds: configuration.categoryIds,
      },
    });
  }

  const failure = apiErrorMessage(create.error, t);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('fields.new')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="new-type">{t('fields.type')}</Label>
            <NativeSelect
              id="new-type"
              value={type}
              onChange={(event) => setType(event.target.value as CustomFieldDtoOutputType)}
            >
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {t(`fields.types.${option}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <ConfigurationFields
            prefix="new"
            type={type}
            value={configuration}
            onChange={(change) => setConfiguration((current) => ({ ...current, ...change }))}
          />
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!configuration.label.trim() || create.isPending}
          >
            <Plus />
            {t('fields.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldItem({
  field,
  canMoveUp,
  canMoveDown,
  onMove,
  moving,
}: {
  field: CustomFieldDtoOutput;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  moving: boolean;
}) {
  const { t } = useTranslation();
  const reload = useReloadFields();
  const [editing, setEditing] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration>(() => ({
    label: field.label,
    help: field.help,
    required: field.required,
    optionsText: field.options.join('\n'),
    useForDetection: field.useForDetection,
    categoryIds: field.categoryIds,
  }));
  const update = useCustomFieldsUpdate({
    mutation: {
      onSuccess: async () => {
        setEditing(false);
        await reload();
      },
    },
  });
  const remove = useCustomFieldsDelete({ mutation: { onSuccess: reload } });
  const failure = apiErrorMessage(update.error ?? remove.error, t);

  function save(event: FormEvent) {
    event.preventDefault();
    update.mutate({
      id: field.id,
      data: {
        label: configuration.label,
        help: configuration.help,
        required: configuration.required,
        useForDetection: configuration.useForDetection,
        categoryIds: configuration.categoryIds,
        ...(WITH_OPTIONS.includes(field.type)
          ? { options: optionsFromText(configuration.optionsText) }
          : {}),
      },
    });
  }

  return (
    <Card className={field.active ? undefined : 'opacity-70'}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 font-semibold">
              {field.label}
              <Badge variant="secondary">{t(`fields.types.${field.type}`)}</Badge>
              {field.required && <Badge variant="outline">{t('fields.required')}</Badge>}
              {!field.active && <Badge variant="outline">{t('fields.inactive')}</Badge>}
            </h2>
            {field.help && <p className="text-sm text-muted-foreground">{field.help}</p>}
            <FieldScope field={field} />
            {field.options.length > 0 && (
              <p className="text-sm text-muted-foreground">{field.options.join(' · ')}</p>
            )}
          </div>
          {!editing && (
            <div className="flex flex-wrap gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('fields.moveUp')}
                disabled={!canMoveUp || moving}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('fields.moveDown')}
                disabled={!canMoveDown || moving}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                {t('fields.edit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: field.id, data: { active: !field.active } })}
              >
                <Power />
                {field.active ? t('fields.deactivate') : t('fields.reactivate')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: field.id })}
              >
                <Trash2 />
                {t('fields.delete')}
              </Button>
            </div>
          )}
        </div>
        {editing && (
          <form className="grid gap-4" onSubmit={save}>
            <ConfigurationFields
              prefix={field.id}
              type={field.type}
              value={configuration}
              onChange={(change) => setConfiguration((current) => ({ ...current, ...change }))}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={update.isPending}>
                {t('fields.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t('fields.cancel')}
              </Button>
            </div>
          </form>
        )}
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Which Categories a field applies to: all of them, or the ones ticked. */
function CategoryScope({
  prefix,
  selected,
  onChange,
}: {
  prefix: string;
  selected: string[];
  onChange: (categoryIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const { data } = useCategoriesList();
  const categories = data?.data ?? [];
  const all = selected.length === 0;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t('fields.scope')}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`${prefix}-scope`}
          className="size-4"
          checked={all}
          onChange={() => onChange([])}
        />
        {t('fields.scopeAll')}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`${prefix}-scope`}
          className="size-4"
          checked={!all}
          onChange={() => categories[0] && onChange([categories[0].id])}
        />
        {t('fields.scopeSome')}
      </label>
      {!all && (
        <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={selected.includes(category.id)}
                // Unticking the last one would turn it back into "all"; the radio is for that.
                disabled={selected.length === 1 && selected[0] === category.id}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, category.id]
                      : selected.filter((id) => id !== category.id),
                  )
                }
              />
              {category.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function FieldScope({ field }: { field: { categoryIds: string[] } }) {
  const { t } = useTranslation();
  const { data } = useCategoriesList({ includeInactive: 'true' });
  if (field.categoryIds.length === 0) return null;
  const names = (data?.data ?? [])
    .filter((category) => field.categoryIds.includes(category.id))
    .map((category) => category.name);
  return (
    <p className="text-sm text-muted-foreground">
      {t('fields.onlyIn', { names: names.join(', ') })}
    </p>
  );
}
