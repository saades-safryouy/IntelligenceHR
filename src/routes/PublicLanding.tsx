import { useNavigate } from 'react-router-dom'
import LandingPage from '../components/landing/LandingPage'
import { usePreferences } from '../app/preferences'

export function PublicLanding() {
  const navigate = useNavigate()
  const { language, theme, changeLanguage, changeTheme } = usePreferences()

  return (
    <LandingPage
      language={language}
      onLanguageChange={changeLanguage}
      onThemeChange={changeTheme}
      theme={theme}
      onLogin={() => navigate('/login')}
    />
  )
}
