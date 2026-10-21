import type { BrandingDtoOutputTexts } from '@sim/api-client';
import { useTranslation } from 'react-i18next';
import { useIdentity } from '@/lib/use-identity';

export type CustomTextKey = keyof BrandingDtoOutputTexts;

/** The SIM text each replaceable text stands for (null: none, the text is new). */
export const TEXT_DEFAULTS: Record<CustomTextKey, string | null> = {
  homeTitle: 'home.title',
  homeSubtitle: 'home.subtitle',
  newIdeaButton: 'home.newIdea',
  newIdeaGuidance: null,
  titleHelp: 'ideas.titleHelp',
  similarTitle: 'similar.title',
  similarHelp: 'similar.help',
};

export const textLanguage = (language: string) => (language.startsWith('en') ? 'en' : 'pt-BR');

/** The Administrator's text in the current language, or else the SIM default. */
export function useText() {
  const identity = useIdentity();
  const { t, i18n } = useTranslation();
  return (key: CustomTextKey) => {
    const custom = identity?.texts[key][textLanguage(i18n.language)];
    if (custom) return custom;
    const fallback = TEXT_DEFAULTS[key];
    return fallback ? t(fallback) : '';
  };
}
