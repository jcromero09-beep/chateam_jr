// Wildcard module declaration for i18n
declare module '*/translate/i18n' {
  import { i18n as I18nInstance } from 'i18next';
  export const i18n: I18nInstance;
}
