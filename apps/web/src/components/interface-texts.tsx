import { type BrandingDtoOutput, getBrandingGetQueryKey, useBrandingUpdate } from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import i18n from '@/i18n';
import { apiErrorMessage } from '@/lib/errors';
import { type CustomTextKey, TEXT_DEFAULTS } from '@/lib/use-text';

const LANGUAGES = ['pt-BR', 'en'] as const;
type Language = (typeof LANGUAGES)[number];

// Same limits as the API; long ones get a text area.
const TEXTS: { key: CustomTextKey; max: number; long?: boolean }[] = [
  { key: 'homeTitle', max: 80 },
  { key: 'homeSubtitle', max: 300, long: true },
  { key: 'newIdeaButton', max: 40 },
  { key: 'newIdeaGuidance', max: 1000, long: true },
  { key: 'titleHelp', max: 120 },
  { key: 'similarTitle', max: 80 },
  { key: 'similarHelp', max: 300, long: true },
];

/** The SIM default of a text in a language, shown as the placeholder. */
function defaultIn(key: CustomTextKey, language: Language) {
  const source = TEXT_DEFAULTS[key];
  return source ? i18n.getFixedT(language)(source) : '';
}

/** Interface texts the Administrator replaces, per language; empty keeps the SIM default. */
export function InterfaceTexts({ branding }: { branding: BrandingDtoOutput }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(
    () =>
      Object.fromEntries(
        TEXTS.map(({ key }) => [
          key,
          Object.fromEntries(
            LANGUAGES.map((language) => [language, branding.texts[key][language] ?? '']),
          ),
        ]),
      ) as Record<CustomTextKey, Record<Language, string>>,
  );
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
    update.mutate({ data: { texts: values } });
  }

  const set = (key: CustomTextKey, language: Language, value: string) =>
    setValues((current) => ({ ...current, [key]: { ...current[key], [language]: value } }));

  const failure = apiErrorMessage(update.error, t);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('interfaceTexts.title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={submit}>
          <p className="text-sm text-muted-foreground">{t('interfaceTexts.help')}</p>
          {TEXTS.map(({ key, max, long }) => (
            <fieldset key={key} className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">
                {t(`interfaceTexts.keys.${key}`)}
              </legend>
              <div className="grid gap-3 md:grid-cols-2">
                {LANGUAGES.map((language) => {
                  const id = `text-${key}-${language}`;
                  const props = {
                    id,
                    // Unique name for screen readers: the text and the language.
                    'aria-label': `${t(`interfaceTexts.keys.${key}`)} (${t(`interfaceTexts.languages.${language}`)})`,
                    maxLength: max,
                    value: values[key][language],
                    placeholder: defaultIn(key, language) || t('interfaceTexts.empty'),
                    onChange: (event: { target: { value: string } }) =>
                      set(key, language, event.target.value),
                  };
                  return (
                    <div key={language} className="grid gap-1">
                      <Label htmlFor={id} aria-hidden className="text-xs text-muted-foreground">
                        {t(`interfaceTexts.languages.${language}`)}
                      </Label>
                      {long ? <Textarea rows={3} {...props} /> : <Input {...props} />}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
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
          <Button type="submit" className="justify-self-start" disabled={update.isPending}>
            {t('interfaceTexts.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
