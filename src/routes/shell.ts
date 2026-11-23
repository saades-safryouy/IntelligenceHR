import type { Language, Theme } from '../contexts/I18nContext'

export interface LayoutShellProps {
  language: Language
  theme: Theme
  onLanguageChange: (language: Language) => void
  onThemeChange: (theme: Theme) => void
  onLogout: () => void
}
