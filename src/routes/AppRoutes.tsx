import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { usePreferences } from '../app/preferences'
import { useAuth } from '../contexts/authHooks'
import { LoginPage } from '../pages/auth/LoginPage'
import { renderEmployeeRoutes } from './EmployeeRoutes'
import { renderHrRoutes } from './HrRoutes'
import { renderManagerRoutes } from './ManagerRoutes'
import { PublicLanding } from './PublicLanding'
import type { LayoutShellProps } from './shell'

export function AppRoutes() {
  const { language, theme, changeLanguage, changeTheme } = usePreferences()
  const { logout } = useAuth()

  const shellProps: LayoutShellProps = {
    language,
    theme,
    onLanguageChange: changeLanguage,
    onThemeChange: changeTheme,
    onLogout: logout,
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route
          path="/login"
          element={
            <LoginPage
              language={language}
              onLanguageChange={changeLanguage}
              theme={theme}
            />
          }
        />

        {renderHrRoutes(shellProps)}
        {renderEmployeeRoutes(shellProps)}
        {renderManagerRoutes(shellProps)}

        <Route path="*" element={<PublicLanding />} />
      </Routes>
    </BrowserRouter>
  )
}
