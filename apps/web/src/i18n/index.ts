import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

export const SUPPORTED_LANGUAGES = ['pt-BR', 'en'] as const;

void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  lng: navigator.language.startsWith('pt') ? 'pt-BR' : 'en',
  fallbackLng: 'pt-BR',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

export default i18n;
