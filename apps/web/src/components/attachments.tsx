import {
  type AttachmentDtoOutput,
  getAttachmentsDownloadUrl,
  useAuthConfiguration,
} from '@sim/api-client';
import { FileText, Paperclip, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { checkFiles, formatSize } from '@/lib/attachments';

/** Files already sent: images as thumbnails, the others as downloads. */
export function AttachmentList({
  attachments,
  onRemove,
  removing,
}: {
  attachments: AttachmentDtoOutput[];
  /** When given, each file gets a remove button. */
  onRemove?: (attachment: AttachmentDtoOutput) => void;
  removing?: boolean;
}) {
  const { t } = useTranslation();
  if (attachments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-3" aria-label={t('attachments.title')}>
      {attachments.map((attachment) => {
        const url = getAttachmentsDownloadUrl(attachment.id);
        return (
          <li key={attachment.id} className="flex items-start gap-1">
            {attachment.image ? (
              <a href={url} target="_blank" rel="noreferrer" title={attachment.filename}>
                <img
                  src={url}
                  alt={attachment.filename}
                  loading="lazy"
                  className="h-24 max-w-48 rounded-md border object-cover"
                />
              </a>
            ) : (
              <a
                href={url}
                download={attachment.filename}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                <FileText className="size-4" aria-hidden />
                <span className="max-w-48 truncate">{attachment.filename}</span>
                <span className="text-muted-foreground">{formatSize(attachment.size)}</span>
              </a>
            )}
            {onRemove && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={removing}
                aria-label={t('attachments.remove', { name: attachment.filename })}
                onClick={() => onRemove(attachment)}
              >
                <X />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Files chosen but not sent yet; they go up after the Idea or Comment is saved. */
export function FilePicker({
  files,
  onChange,
  existing = 0,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  /** Files the item already has, which count towards the limit. */
  existing?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const { data } = useAuthConfiguration({ query: { staleTime: 5 * 60_000 } });
  const limits = data?.data.attachments;
  const problem = limits ? checkFiles(files, existing, limits) : undefined;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label={t('attachments.choose')}
          accept={limits?.extensions.map((extension) => `.${extension}`).join(',')}
          onChange={(event) => {
            onChange([...files, ...Array.from(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Paperclip />
          {t('attachments.add')}
        </Button>
        {limits && (
          <span className="text-xs text-muted-foreground">
            {t('attachments.help', { count: limits.maxCount, size: formatSize(limits.maxBytes) })}
          </span>
        )}
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
            >
              <span className="max-w-48 truncate">{file.name}</span>
              <span className="text-muted-foreground">{formatSize(file.size)}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={t('attachments.remove', { name: file.name })}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {t(problem.key, problem.values)}
        </p>
      )}
    </div>
  );
}
