 import { useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import LandingPage from './components/landing/LandingPage'
import { AppLayout } from './components/layout/AppLayout'
import { EmployeeLayout } from './components/layout/EmployeeLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/authHooks'
import { I18nContext, translations, phraseTranslations } from './contexts/I18nContext'
import type { Language, Theme, TranslationKey } from './contexts/I18nContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { RoleRoute } from './components/auth/RoleRoute'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { PeoplePage } from './pages/people/PeoplePage'
import { EmployeeShowcasePage } from './pages/people/EmployeeShowcasePage'
import { OnboardingPage } from './pages/onboarding/OnboardingPage'
import { OffboardingPage } from './pages/offboarding/OffboardingPage'
import { LeavePage } from './pages/leave/LeavePage'
import { HolidaysPage } from './pages/holidays/HolidaysPage'
import { DocumentsPage } from './pages/documents/DocumentsPage'
import { CalendarPage } from './pages/calendar/CalendarPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { RecruitmentPage } from './pages/recruitment/RecruitmentPage'
import { AttendancePage } from './pages/attendance/AttendancePage'
import { PerformancePage } from './pages/performance/PerformancePage'
import { TrainingPage } from './pages/training/TrainingPage'
import { AskIntelligencePage } from './pages/intelligence/AskIntelligencePage'
import { AutomationsPage } from './pages/automations/AutomationsPage'
import { PayrollPage } from './pages/payroll/PayrollPage'
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard'
import { EmployeeProfilePage } from './pages/employee/EmployeeProfilePage'
import { EmployeeLeavePage } from './pages/employee/EmployeeLeavePage'
import { EmployeeHolidaysPage } from './pages/employee/EmployeeHolidaysPage'
import { EmployeeDocumentsPage } from './pages/employee/EmployeeDocumentsPage'
import { EmployeeOnboardingPage } from './pages/employee/EmployeeOnboardingPage'
import { EmployeeOffboardingPage } from './pages/employee/EmployeeOffboardingPage'
import { EmployeeNotificationsPage } from './pages/employee/EmployeeNotificationsPage'
import { EmployeeOrganigramPage } from './pages/employee/EmployeeOrganigramPage'
import { EmployeeWorkflowsPage } from './pages/employee/EmployeeWorkflowsPage'
import { ManagerLayout } from './components/layout/ManagerLayout'
import { ManagerDashboardPage } from './pages/manager/ManagerDashboardPage'
import { ManagerTeamPage } from './pages/manager/ManagerTeamPage'
import { ManagerApprovalCenterPage } from './pages/manager/ManagerApprovalCenterPage'
import { ManagerRequestPage } from './pages/manager/ManagerRequestPage'
import { ManagerLeavePage } from './pages/manager/ManagerLeavePage'
import { ManagerHolidaysPage } from './pages/manager/ManagerHolidaysPage'
import { ManagerOnboardingPage } from './pages/manager/ManagerOnboardingPage'
import { ManagerOffboardingPage } from './pages/manager/ManagerOffboardingPage'
import { ManagerWorkflowsPage } from './pages/manager/ManagerWorkflowsPage'
import { ManagerNotificationsPage } from './pages/manager/ManagerNotificationsPage'
import { AnalyticsPage } from './pages/analytics/AnalyticsPage'
import { WorkflowPage } from './pages/workflow/WorkflowPage'
import { WorkflowDetailPage } from './pages/workflow/WorkflowDetailPage'
import { OrganigrammePage } from './pages/people/OrganigrammePage'
import './App.css'
import './styles.css'

function AppContent() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('Intillegence-theme') as Theme) || 'dark')
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('Intillegence-language') as Language) || 'en')
  const { logout } = useAuth()

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

  return (
    <div className={`app ${theme}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <I18nContext.Provider value={{ language, text }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PublicLanding language={language} onLanguageChange={changeLanguage} onThemeChange={changeTheme} theme={theme} />} />
            <Route path="/login" element={<LoginPage language={language} onLanguageChange={changeLanguage} theme={theme} />} />
            
            {/* HR Routes */}
            <Route path="/app" element={
              <ProtectedRoute>
                <RoleRoute roles={['HR Administrator', 'HR', 'Manager', 'Local IT', 'ISD', 'Department Head']}>
                  <AppLayout language={language} theme={theme} onThemeChange={changeTheme} onLanguageChange={changeLanguage} onLogout={logout} />
                </RoleRoute>
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/app/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="employees" element={<PeoplePage />} />
              <Route path="employees/:employeeId" element={<EmployeeShowcasePage />} />
              <Route path="organigramme" element={<OrganigrammePage />} />
              <Route path="onboarding/requests" element={<OnboardingPage />} />
              <Route path="offboarding/requests" element={<OffboardingPage />} />
              <Route path="leave/requests" element={<LeavePage />} />
              <Route path="workflows" element={<WorkflowPage />} />
              <Route path="workflows/:instanceId" element={<WorkflowDetailPage />} />
              <Route path="holidays" element={<HolidaysPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="recruitment" element={<RecruitmentPage />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="performance" element={<PerformancePage />} />
              <Route path="training" element={<TrainingPage />} />
              <Route path="payroll" element={<PayrollPage />} />
              <Route path="intelligence/ask" element={<AskIntelligencePage />} />
              <Route path="automations" element={<AutomationsPage />} />
            </Route>

            {/* Employee Routes */}
            <Route path="/employee" element={
              <ProtectedRoute>
                <RoleRoute roles={['Employee']}>
                  <EmployeeLayout language={language} theme={theme} onThemeChange={changeTheme} onLanguageChange={changeLanguage} onLogout={logout} />
                </RoleRoute>
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/employee/dashboard" replace />} />
              <Route path="dashboard" element={<EmployeeDashboard />} />
              <Route path="profile" element={<EmployeeProfilePage />} />
              <Route path="leave" element={<EmployeeLeavePage />} />
              <Route path="holidays" element={<EmployeeHolidaysPage />} />
              <Route path="documents" element={<EmployeeDocumentsPage />} />
              <Route path="onboarding" element={<EmployeeOnboardingPage />} />
              <Route path="offboarding" element={<EmployeeOffboardingPage />} />
              <Route path="notifications" element={<EmployeeNotificationsPage />} />
              <Route path="organigram" element={<EmployeeOrganigramPage />} />
              <Route path="workflows" element={<EmployeeWorkflowsPage />} />
              <Route path="workflows/:instanceId" element={<WorkflowDetailPage />} />
            </Route>

            {/* Manager Routes */}
            <Route path="/manager" element={
              <ProtectedRoute>
                <RoleRoute roles={['Manager', 'Department Head']}>
                  <ManagerLayout language={language} theme={theme} onThemeChange={changeTheme} onLanguageChange={changeLanguage} onLogout={logout} />
                </RoleRoute>
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/manager/dashboard" replace />} />
              <Route path="dashboard" element={<ManagerDashboardPage />} />
              <Route path="analytics" element={<AnalyticsPage mode="manager" />} />
              <Route path="team" element={<ManagerTeamPage />} />
              <Route path="team/:employeeId" element={<EmployeeShowcasePage />} />
              <Route path="leave" element={<ManagerLeavePage />} />
              <Route path="holidays" element={<ManagerHolidaysPage />} />
              <Route path="onboarding" element={<ManagerOnboardingPage />} />
              <Route path="offboarding" element={<ManagerOffboardingPage />} />
              <Route path="approvals" element={<ManagerApprovalCenterPage />} />
              <Route path="workflows" element={<ManagerWorkflowsPage />} />
              <Route path="workflows/:instanceId" element={<WorkflowDetailPage />} />
              <Route path="notifications" element={<ManagerNotificationsPage />} />
              <Route path="requests/:resourceType/:resourceId" element={<ManagerRequestPage />} />
            </Route>

            <Route path="*" element={<PublicLanding language={language} onLanguageChange={changeLanguage} onThemeChange={changeTheme} theme={theme} />} />
          </Routes>
        </BrowserRouter>
      </I18nContext.Provider>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function PublicLanding({
  language,
  onLanguageChange,
  onThemeChange,
  theme,
}: {
  language: Language
  onLanguageChange: (language: Language) => void
  onThemeChange: (theme: Theme) => void
  theme: Theme
}) {
  const navigate = useNavigate()

  return (
    <LandingPage
      language={language}
      onLanguageChange={onLanguageChange}
      onThemeChange={onThemeChange}
      theme={theme}
      onLogin={() => navigate('/login')}
    />
  )
}
