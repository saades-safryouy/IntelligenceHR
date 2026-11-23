import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import type { Role } from '../../types/models'

interface RoleRouteProps {
  children: React.ReactNode
  roles: Role | Role[]
}

export function RoleRoute({ children, roles }: RoleRouteProps) {
  const { isAuthenticated, isLoading, hasAnyRole, role } = useAuth()

  if (isLoading) {
    return <div role="status" className="page">Restoring secure session…</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  if (!hasAnyRole(allowedRoles)) {
    // Redirect based on user's actual role
    if (role === 'Employee') {
      return <Navigate to="/employee/dashboard" replace />
    } else if (role === 'Manager' || role === 'Department Head') {
      return <Navigate to="/manager/dashboard" replace />
    } else if (role === 'HR Administrator' || role === 'HR' || role === 'Local IT' || role === 'ISD') {
      return <Navigate to="/app/dashboard" replace />
    } else {
      return <Navigate to="/employee/dashboard" replace />
    }
  }

  return <>{children}</>
}

