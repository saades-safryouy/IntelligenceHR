import { Navigate, Route } from 'react-router-dom'
import { ProtectedRoute } from '../components/auth/ProtectedRoute'
import { RoleRoute } from '../components/auth/RoleRoute'
import { EmployeeLayout } from '../components/layout/EmployeeLayout'
import { EmployeeDashboard } from '../pages/employee/EmployeeDashboard'
import { EmployeeDocumentsPage } from '../pages/employee/EmployeeDocumentsPage'
import { EmployeeHolidaysPage } from '../pages/employee/EmployeeHolidaysPage'
import { EmployeeLeavePage } from '../pages/employee/EmployeeLeavePage'
import { EmployeeNotificationsPage } from '../pages/employee/EmployeeNotificationsPage'
import { EmployeeOffboardingPage } from '../pages/employee/EmployeeOffboardingPage'
import { EmployeeOnboardingPage } from '../pages/employee/EmployeeOnboardingPage'
import { EmployeeOrganigramPage } from '../pages/employee/EmployeeOrganigramPage'
import { EmployeeProfilePage } from '../pages/employee/EmployeeProfilePage'
import { EmployeeWorkflowsPage } from '../pages/employee/EmployeeWorkflowsPage'
import { MyPayslipsPage } from '../pages/payroll/MyPayslipsPage'
import { WorkflowDetailPage } from '../pages/workflow/WorkflowDetailPage'
import { EMPLOYEE_ROLES } from './roles'
import type { LayoutShellProps } from './shell'

export function renderEmployeeRoutes(shell: LayoutShellProps) {
  return (
    <Route
      path="/employee"
      element={
        <ProtectedRoute>
          <RoleRoute roles={EMPLOYEE_ROLES}>
            <EmployeeLayout
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
      <Route path="payslips" element={<MyPayslipsPage />} />
    </Route>
  )
}
