import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

const STORAGE_KEY = 'qualiguali.language';

function getInitialLanguage() {
  if (typeof window === 'undefined') return 'es';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'es' || stored === 'en') return stored;
  return window.navigator.language?.startsWith('en') ? 'en' : 'es';
}

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

// Language preference is not session-critical, just a UX nicety — same
// justification as the theme preference.
i18n.on('languageChanged', (lng) => {
  window.localStorage.setItem(STORAGE_KEY, lng);
});

export default i18n;
