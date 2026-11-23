import { Navigate, Route } from 'react-router-dom'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { RoleRoute } from '../components/auth/RoleRoute'
import { ManagerLayout } from '../components/layout/ManagerLayout'
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage'
import { EmployeeShowcasePage } from '../pages/people/EmployeeShowcasePage'
import { ManagerApprovalCenterPage } from '../pages/manager/ManagerApprovalCenterPage'
import { ManagerDashboardPage } from '../pages/manager/ManagerDashboardPage'
import { ManagerHolidaysPage } from '../pages/manager/ManagerHolidaysPage'
import { ManagerLeavePage } from '../pages/manager/ManagerLeavePage'
import { ManagerNotificationsPage } from '../pages/manager/ManagerNotificationsPage'
import { ManagerOffboardingPage } from '../pages/manager/ManagerOffboardingPage'
import { ManagerOnboardingPage } from '../pages/manager/ManagerOnboardingPage'
import { ManagerRequestPage } from '../pages/manager/ManagerRequestPage'
import { ManagerTeamPage } from '../pages/manager/ManagerTeamPage'
import { ManagerWorkflowsPage } from '../pages/manager/ManagerWorkflowsPage'
import { WorkflowDetailPage } from '../pages/workflow/WorkflowDetailPage'
import { MANAGER_ROLES } from './roles'
import type { LayoutShellProps } from './shell'

export function renderManagerRoutes(shell: LayoutShellProps) {
  return (
    <Route
      path="/manager"
      element={
        <ProtectedRoute>
          <RoleRoute roles={MANAGER_ROLES}>
            <ManagerLayout
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
  )
}
