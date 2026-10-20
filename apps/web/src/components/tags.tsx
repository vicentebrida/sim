import { type TagDtoOutput, useTagsList } from '@sim/api-client';
import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function TagList({ tags, className }: { tags: TagDtoOutput[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1', className)}>
      {tags.map((tag) => (
        <li
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
        >
          <Tag className="size-3" aria-hidden />
          {tag.name}
        </li>
      ))}
    </ul>
  );
}

/** Toggles the Tags the Administrator created; renders nothing while there are none. */
export function TagPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useTagsList({ query: { staleTime: 60_000 } });
  const tags = data?.data ?? [];
  if (!tags.length) return null;
  const chosen = new Set(value);
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t('tags.title')}</legend>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <label
            key={tag.id}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
              chosen.has(tag.id) && 'border-primary bg-primary/10',
            )}
          >
            <input
              type="checkbox"
              className="size-3.5"
              checked={chosen.has(tag.id)}
              disabled={disabled}
              onChange={() =>
                onChange(
                  chosen.has(tag.id) ? value.filter((id) => id !== tag.id) : [...value, tag.id],
                )
              }
            />
            {tag.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
