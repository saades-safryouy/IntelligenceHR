import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  I18nContext,
  phraseTranslations,
  translations,
  type Language,
  type Theme,
  type TranslationKey,
} from '../contexts/I18nContext'

interface PreferencesContextValue {
  language: Language
  theme: Theme
  changeLanguage: (next: Language) => void
  changeTheme: (next: Theme) => void
  text: (key: TranslationKey | string) => string
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('Intillegence-theme') as Theme) || 'light',
  )
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem('Intillegence-language') as Language) || 'en',
  )

  const text = useMemo(
    () => (key: TranslationKey | string) => {
      const locale = translations[language] as Record<string, unknown>
      const directValue = locale[key]
      if (typeof directValue === 'string') return directValue
      const phraseValue = phraseTranslations[language][key]
      return phraseValue || key
    },
    [language],
  )

  const changeTheme = (next: Theme) => {
    setTheme(next)
    localStorage.setItem('Intillegence-theme', next)
  }

  const changeLanguage = (next: Language) => {
    setLanguage(next)
    localStorage.setItem('Intillegence-language', next)
  }

  const value = useMemo(
    () => ({ language, theme, changeLanguage, changeTheme, text }),
    [language, theme, text],
  )

  return (
    <PreferencesContext.Provider value={value}>
      <div className={`app ${theme}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <I18nContext.Provider value={{ language, text }}>
          {children}
        </I18nContext.Provider>
      </div>
    </PreferencesContext.Provider>
  )
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return ctx
}
