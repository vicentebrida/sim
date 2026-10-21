import {
  type BrandingDtoOutput,
  brandingRemoveAsset,
  brandingSetAsset,
  getBrandingGetQueryKey,
  useBrandingGet,
  useBrandingUpdate,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Trash2, Upload } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/form-field';
import { InterfaceTexts } from '@/components/interface-texts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { readableForeground } from '@/lib/branding';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/branding')({ component: BrandingPage });

type Kind = 'logoLight' | 'logoDark' | 'favicon' | 'loginImage';
const KINDS: Kind[] = ['logoLight', 'logoDark', 'favicon', 'loginImage'];
const DEFAULT_COLOR = '#4f46e5';

function BrandingPage() {
  const { t } = useTranslation();
  const { data } = useBrandingGet();
  const branding = data?.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('branding.title')}</h1>
        <p className="text-muted-foreground">{t('branding.sub')}</p>
      </div>
      {branding && <TextsForm branding={branding} />}
      {branding && <InterfaceTexts branding={branding} />}
      {branding && <Images branding={branding} />}
    </div>
  );
}

function TextsForm({ branding }: { branding: BrandingDtoOutput }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(branding.name);
  const [color, setColor] = useState<string | null>(branding.primaryColor);
  const [loginTitle, setLoginTitle] = useState(branding.loginTitle);
  const [loginText, setLoginText] = useState(branding.loginText);
  const [saved, setSaved] = useState(false);
  const update = useBrandingUpdate({
    mutation: {
      onSuccess: async () => {
        setSaved(true);
        await queryClient.invalidateQueries({ queryKey: getBrandingGetQueryKey() });
      },
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    update.mutate({ data: { name, primaryColor: color, loginTitle, loginText } });
  }

  const shown = color ?? DEFAULT_COLOR;
  const failure = apiErrorMessage(update.error, t);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('branding.texts')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <FormField
            id="brand-name"
            label={t('branding.name')}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="grid gap-2">
            <Label htmlFor="brand-color">{t('branding.color')}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="brand-color"
                type="color"
                className="h-9 w-14 cursor-pointer rounded border"
                value={shown}
                onChange={(event) => setColor(event.target.value)}
              />
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ background: shown, color: readableForeground(shown) }}
              >
                {t('branding.preview')}
              </span>
              {color && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setColor(null)}>
                  {t('branding.defaultColor')}
                </Button>
              )}
            </div>
          </div>
          <FormField
            id="brand-login-title"
            label={t('branding.loginTitle')}
            value={loginTitle}
            maxLength={80}
            onChange={(event) => setLoginTitle(event.target.value)}
          />
          <div className="grid gap-2">
            <Label htmlFor="brand-login-text">{t('branding.loginText')}</Label>
            <Textarea
              id="brand-login-text"
              rows={3}
              maxLength={500}
              value={loginText}
              onChange={(event) => setLoginText(event.target.value)}
            />
          </div>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          {saved && !failure && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('branding.saved')}
            </p>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={!name.trim() || update.isPending}
          >
            {t('branding.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Images({ branding }: { branding: BrandingDtoOutput }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('branding.images')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4 sm:grid-cols-2">
          {KINDS.map((kind) => (
            <li key={kind}>
              <ImageSlot kind={kind} url={branding[kind]} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ImageSlot({ kind, url }: { kind: Kind; url: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const reload = () => queryClient.invalidateQueries({ queryKey: getBrandingGetQueryKey() });

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const label = t(`branding.kinds.${kind}`);
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{t(`branding.kindHelp.${kind}`)}</p>
      <div
        className={
          kind === 'logoDark'
            ? 'flex h-24 items-center justify-center rounded-md border bg-neutral-900 p-2'
            : 'flex h-24 items-center justify-center rounded-md border bg-white p-2'
        }
      >
        {url ? (
          <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-neutral-500">{t('branding.none')}</span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,.ico"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(() => brandingSetAsset(kind, { file }));
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload />
          {t('branding.upload')}
        </Button>
        {url && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => brandingRemoveAsset(kind))}
          >
            <Trash2 />
            {t('branding.remove')}
          </Button>
        )}
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(error, t)}
        </p>
      )}
    </div>
  );
}
