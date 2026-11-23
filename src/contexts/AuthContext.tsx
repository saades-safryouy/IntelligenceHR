import { useEffect, useState, type ReactNode } from 'react'
import type { AuthenticatedUser, Employee, Role, User } from '../types/models'
import { demoUsers, employees } from '../data/mock'
import { ApiError, apiData, apiRequest, isApiDataMode } from '../lib/apiClient'
import { AuthContext } from './authHooks'

interface ApiPrincipal {
  user: { id: string; name: string; email: string; employeeId: number | null }
  employee: { id: number; departmentId: string | null; positionId: string | null } | null
  roles: string[]
}

function toSessionUser(source: User | (User & Partial<Employee>)): User {
  return {
    id: source.userId ?? source.id,
    name: source.name,
    title: source.title,
    role: source.role,
    initials: source.initials,
    email: source.email,
    userId: source.userId ?? source.id,
  }
}

function toApiSessionUser(principal: ApiPrincipal, permissionsList: string[] = []): AuthenticatedUser {
  const roleNames: Record<string, Role> = {
    'super-admin': 'HR Administrator',
    'bootstrap-admin': 'HR Administrator',
    'hr-admin': 'HR Administrator',
    'hr-administrator': 'HR Administrator',
    'hr-manager': 'HR',
    hr: 'HR',
    'hr-specialist': 'HR',
    'hr-officer': 'HR',
    'department-manager': 'Department Head',
    'department-head': 'Department Head',
    manager: 'Manager',
    employee: 'Employee',
    'workflow-approver': 'Manager',
    'local-it': 'Local IT',
    isd: 'ISD',
  }

  const mappedRoles = new Set(principal.roles.map((key) => roleNames[key.toLowerCase()]).filter(Boolean))

  const permSet = new Set(permissionsList)
  const hasHrPermissions =
    permSet.has('people.employee.view.all') ||
    permSet.has('people.employee.create') ||
    permSet.has('rbac.role.view') ||
    permSet.has('rbac.permission.view')

  const hasManagerPermissions =
    permSet.has('people.employee.view.department') ||
    permSet.has('workflow.approve')

  if (hasHrPermissions) {
    if (mappedRoles.has('HR Administrator') || permSet.has('rbac.role.view')) {
      mappedRoles.add('HR Administrator')
    } else {
      mappedRoles.add('HR')
    }
  } else if (hasManagerPermissions && !mappedRoles.has('HR Administrator') && !mappedRoles.has('HR')) {
    if (!mappedRoles.has('Department Head') && !mappedRoles.has('Manager')) {
      mappedRoles.add('Manager')
    }
  }

  const rolePriority: Role[] = ['HR Administrator', 'HR', 'Department Head', 'Manager', 'Local IT', 'ISD', 'Employee']
  const role = rolePriority.find((candidate) => mappedRoles.has(candidate)) ?? 'Employee'
  const employeeId = principal.employee?.id ?? 0
  const [firstName = '', ...lastNameParts] = principal.user.name.trim().split(/\s+/)

  return {
    id: principal.user.id,
    name: principal.user.name,
    title: role,
    role,
    initials: `${firstName[0] ?? ''}${lastNameParts.join(' ')[0] ?? ''}`.toUpperCase(),
    email: principal.user.email,
    userId: principal.user.id,
    employeeId,
    firstName,
    lastName: lastNameParts.join(' '),
    departmentId: principal.employee?.departmentId ?? null,
    positionId: principal.employee?.positionId ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<string[]>([])
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() => {
    if (isApiDataMode) return null
    const storedUser = sessionStorage.getItem('Intillegence-user')
    const storedAuth = sessionStorage.getItem('Intillegence-authenticated')
    if (storedUser && storedAuth === 'true') {
      try {
        return JSON.parse(storedUser) as User
      } catch {
        return null
      }
    }
    return null
  })
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !isApiDataMode && sessionStorage.getItem('Intillegence-authenticated') === 'true'
  })
  const [role, setRole] = useState<Role | null>(() => {
    if (isApiDataMode) return null
    const storedUser = sessionStorage.getItem('Intillegence-user')
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser) as User
        return (user.role as Role) || null
      } catch {
        return null
      }
    }
    return null
  })
  const [isLoading, setIsLoading] = useState<boolean>(isApiDataMode)
  const [initializationError, setInitializationError] = useState<string | null>(null)

  useEffect(() => {
    if (!isApiDataMode) return

    let active = true
    Promise.all([
      apiData<ApiPrincipal>('/api/v1/auth/me'),
      apiData<string[]>('/api/v1/me/permissions'),
    ])
      .then(([principal, grantedPermissions]) => {
        if (!active) return
        const sessionUser = toApiSessionUser(principal, grantedPermissions)
        setCurrentUser(sessionUser)
        setIsAuthenticated(true)
        setRole(sessionUser.role)
        setPermissions(grantedPermissions)
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof ApiError && error.status === 401)) return
        setInitializationError(error instanceof Error ? error.message : 'Could not restore the secure session.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = async (email: string, password: string) => {
    setInitializationError(null)
    if (isApiDataMode) {
      const principal = await apiData<ApiPrincipal>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      const grantedPermissions = await apiData<string[]>('/api/v1/me/permissions')
      const sessionUser = toApiSessionUser(principal, grantedPermissions)
      setCurrentUser(sessionUser)
      setIsAuthenticated(true)
      setRole(sessionUser.role)
      setPermissions(grantedPermissions)
      return
    }

    let foundUser: User | undefined = demoUsers.find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    )

    if (!foundUser) {
      const employee = employees.find((emp) => emp.email.toLowerCase() === email.toLowerCase())
      if (employee) {
        // Resolve canonical role from demoUsers if matched by email or ID
        const matchedDemo = demoUsers.find((u) => u.email.toLowerCase() === employee.email.toLowerCase() || u.id === employee.userId)
        foundUser = {
          id: employee.userId,
          name: `${employee.firstName} ${employee.lastName}`,
          title: employee.jobTitle,
          role: matchedDemo?.role || employee.role || 'Employee',
          initials: employee.initials,
          email: employee.email,
          userId: employee.userId,
        }
      }
    }

    if (foundUser && password === 'password') {
      const sessionUser = toSessionUser(foundUser)
      setCurrentUser(sessionUser)
      setIsAuthenticated(true)
      setRole(sessionUser.role)
      setPermissions([])
      sessionStorage.setItem('Intillegence-user', JSON.stringify(sessionUser))
      sessionStorage.setItem('Intillegence-authenticated', 'true')
    } else {
      throw new Error('Invalid credentials')
    }
  }

  const logout = async () => {
    if (isApiDataMode) {
      try {
        await apiRequest<void>('/api/v1/auth/logout', { method: 'POST' })
      } catch (error) {
        setInitializationError(error instanceof Error ? error.message : 'Could not close the secure session.')
        return
      }
    }
    setCurrentUser(null)
    setIsAuthenticated(false)
    setRole(null)
    setPermissions([])
    sessionStorage.removeItem('Intillegence-user')
    sessionStorage.removeItem('Intillegence-authenticated')
    window.location.href = '/'
  }

  const hasRole = (roleToCheck: Role) => role === roleToCheck

  const hasAnyRole = (rolesToCheck: Role[]): boolean =>
    role ? rolesToCheck.includes(role) : false

  const isHR = () => hasRole('HR Administrator') || hasRole('HR')

  const isEmployee = () => hasRole('Employee')

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        isLoading,
        initializationError,
        role,
        hasPermission: (permission: string) => permissions.includes(permission),
        login,
        logout,
        hasRole,
        hasAnyRole,
        isHR,
        isEmployee,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
