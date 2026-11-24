import { Navigate, Route } from 'react-router-dom'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { RoleRoute } from '../components/auth/RoleRoute'
import { AppLayout } from '../components/layout/AppLayout'
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage'
import { AttendancePage } from '../pages/attendance/AttendancePage'
import { AutomationsPage } from '../pages/automations/AutomationsPage'
import { CalendarPage } from '../pages/calendar/CalendarPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { DepartmentsPage } from '../pages/departments/DepartmentsPage'
import { DocumentsPage } from '../pages/documents/DocumentsPage'
import { HolidaysPage } from '../pages/holidays/HolidaysPage'
import { AskIntelligencePage } from '../pages/intelligence/AskIntelligencePage'
import { LeavePage } from '../pages/leave/LeavePage'
import { OffboardingPage } from '../pages/offboarding/OffboardingPage'
import { OnboardingPage } from '../pages/onboarding/OnboardingPage'
import { PayrollPage } from '../pages/payroll/PayrollPage'
import { EmployeeShowcasePage } from '../pages/people/EmployeeShowcasePage'
import { OrganigrammePage } from '../pages/people/OrganigrammePage'
import { PeoplePage } from '../pages/people/PeoplePage'
import { PerformancePage } from '../pages/performance/PerformancePage'
import { RecruitmentPage } from '../pages/recruitment/RecruitmentPage'
import { ReportsPage } from '../pages/reports/ReportsPage'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { TrainingPage } from '../pages/training/TrainingPage'
import { WorkflowDetailPage } from '../pages/workflow/WorkflowDetailPage'
import { WorkflowPage } from '../pages/workflow/WorkflowPage'
import { HR_ROLES } from './roles'
import type { LayoutShellProps } from './shell'

export function renderHrRoutes(shell: LayoutShellProps) {
  return (
    <Route
      path="/app"
      element={
        <ProtectedRoute>
          <RoleRoute roles={HR_ROLES}>
            <AppLayout
              language={shell.language}
              theme={shell.theme}
              onThemeChange={shell.onThemeChange}
              onLanguageChange={shell.onLanguageChange}
              onLogout={shell.onLogout}
            />
          </RoleRoute>
        </ProtectedRoute>
      }
    >
      <Route index element={<Navigate to="/app/dashboard" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="employees" element={<PeoplePage />} />
      <Route path="departments" element={<DepartmentsPage />} />
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
  )
}
