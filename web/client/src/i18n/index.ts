import { createI18n } from 'vue-i18n'
import en from './en.json'
import zh from './zh.json'

const savedLocale = localStorage.getItem('yi-lin-locale') || 'zh'

export const i18n = createI18n({
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { en, zh },
})

export function setLocale(locale: string) {
  (i18n.global.locale as string) = locale
  localStorage.setItem('yi-lin-locale', locale)
}
