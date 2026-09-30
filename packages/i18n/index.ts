import { createInstance } from 'i18next';
import english from './en.json';

export type MessageKey = keyof typeof english;
export type ErrorCode = Extract<MessageKey, `error.${string}`>;
export type Dictionary = Record<MessageKey, string>;
export type Values = Record<string, string | number>;
export type Translator = (key: MessageKey, values?: Values) => string;
export { english };

export function createTranslator(locale = 'en', dictionary: Dictionary = english): Translator {
  const instance = createInstance();
  void instance.init({
    lng: locale, fallbackLng: 'en', keySeparator: false, initImmediate: false, showSupportNotice: false,
    resources: { en: { translation: english }, [locale]: { translation: dictionary } },
    interpolation: { escapeValue: false }
  });
  return (key, values) => instance.t(key, values || {});
}
