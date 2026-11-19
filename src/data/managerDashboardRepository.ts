import { apiRequest } from '../lib/apiClient'
import { apiEmployeeRepository } from './apiEmployeeRepository'
import {
  listWorkflowDelegations,
  listWorkflowInstances,
  type WorkflowDelegation,
  type WorkflowInstance,
  type WorkflowListFilters,
} from './apiWorkflowRepository'
import type { Employee, LeaveRequest, Holiday, OnboardingRequest, OffboardingRequest } from '../types/models'

interface ApiPage<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

interface ApiLeaveRequest {
  id: string
  employee_id: number
  employee?: { first_name: string; last_name: string } | null
  leave_type_id: string
  leave_type?: { name_key: string } | null
  start_date: string
  end_date: string
  from_half: LeaveRequest['fromHalf']
  to_half: LeaveRequest['toHalf']
  duration: number | string
  backup_employee_id: number | null
  backup_employee?: { first_name: string; last_name: string } | null
  note: string | null
  status: LeaveRequest['status']
  submitted_at: string
}

async function loadPages<T>(
  loadPage: (page: number) => Promise<{ data: T[]; total: number; pageSize: number }>,
): Promise<T[]> {
  const first = await loadPage(1)
  const pages = Math.ceil(first.total / first.pageSize)
  if (pages <= 1) return first.data

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => loadPage(index + 2)),
  )
  return [first.data, ...rest.map((page) => page.data)].flat()
}

export function listVisibleEmployees(): Promise<Employee[]> {
  return loadPages(async (page) => {
    const result = await apiEmployeeRepository.list({ page, pageSize: 100 })
    return result
  })
}

export function getVisibleReportingDescendants(employees: Employee[], managerId: number): Employee[] {
  const visited = new Set<number>([managerId])
  const descendants: Employee[] = []
  let frontier = [managerId]

  while (frontier.length) {
    const next: number[] = []
    for (const employee of employees) {
      if (employee.managerId === null || employee.managerId === undefined || !frontier.includes(employee.managerId)) continue
      if (visited.has(employee.id)) continue
      visited.add(employee.id)
      descendants.push(employee)
      next.push(employee.id)
    }
    frontier = next
  }

  return descendants
}

export function listVisibleLeaveRequests(status?: LeaveRequest['status']): Promise<LeaveRequest[]> {
  return loadPages(async (page) => {
    const params = new URLSearchParams({ page: String(page), pageSize: '100' })
    if (status) params.set('status', status)
    const result = await apiRequest<ApiPage<ApiLeaveRequest>>(`/api/v1/leave-requests?${params}`)
    return {
      ...result,
      data: result.data.map((item) => ({
        id: item.id,
        userId: item.employee_id,
        employee: item.employee ? `${item.employee.first_name} ${item.employee.last_name}`.trim() : '',
        typeId: item.leave_type_id,
        type: item.leave_type?.name_key ?? '',
        start: item.start_date,
        end: item.end_date,
        fromHalf: item.from_half,
        toHalf: item.to_half,
        duration: Number(item.duration),
        backup: item.backup_employee ? `${item.backup_employee.first_name} ${item.backup_employee.last_name}`.trim() : '',
        backupUserId: item.backup_employee_id,
        note: item.note ?? '',
        status: item.status,
        submittedAt: item.submitted_at,
      })),
    }
  })
}

export function listVisibleWorkflows(filters: WorkflowListFilters = {}): Promise<WorkflowInstance[]> {
  return loadPages(async (page) => listWorkflowInstances({ ...filters, page, pageSize: 100 }))
}

export function listVisibleDelegations(): Promise<WorkflowDelegation[]> {
  return loadPages(async (page) => listWorkflowDelegations(page))
}

export interface ManagerNotification {
  id: string
  type: string
  title: string
  body: string | null
  resource_type: string | null
  resource_id: string | null
  created_at: string
  read_at: string | null
}

export async function listVisibleOnboarding(): Promise<OnboardingRequest[]> {
  const response = await apiRequest<{ data: any[] }>('/api/v1/onboarding-cases')
  return (response.data ?? []).map((item) => ({
    id: String(item.id ?? ''),
    userId: item.employee_id ?? null,
    employee: item.employee_name ?? '',
    position: item.position ?? '',
    department: item.department ?? '',
    startDate: item.start_date ?? '',
    stage: item.stage ?? 'HR Validation',
    assignee: item.assignee ?? 'HR Team',
    progress: item.progress ?? 0,
    status: item.status ?? 'On track',
    approvalStatus: item.approval_status ?? null,
    employeeTasks: (item.tasks ?? []).map((t: any) => ({
      id: String(t.id ?? ''),
      labelKey: t.label_key ?? '',
      done: Boolean(t.done),
      dueDate: t.due_date ?? undefined,
      employeeVisible: Boolean(t.employee_visible ?? true),
    })),
  }))
}

export async function listVisibleOffboarding(): Promise<OffboardingRequest[]> {
  const response = await apiRequest<{ data: any[] }>('/api/v1/offboarding-cases')
  return (response.data ?? []).map((item) => ({
    id: String(item.id ?? ''),
    userId: item.employee_id ?? null,
    employee: item.employee_name ?? '',
    exitDate: item.exit_date ?? '',
    reason: item.reason ?? '',
    replacement: item.replacement ?? '',
    stage: item.stage ?? 'Pending',
    progress: item.progress ?? 0,
    status: item.status ?? 'On track',
    approvalStatus: item.approval_status ?? null,
  }))
}

export async function listVisibleHolidays(year?: number): Promise<Holiday[]> {
  const url = year ? `/api/v1/holidays?year=${year}` : '/api/v1/holidays'
  const response = await apiRequest<{ data: any[] }>(url)
  return (response.data ?? []).map((item) => ({
    id: String(item.id ?? ''),
    name: item.name ?? '',
    nameKey: item.name_key ?? undefined,
    date: item.date ?? '',
    days: item.days ?? 1,
    recurring: Boolean(item.recurring),
    type: item.type ?? 'Public',
    country: item.country ?? null,
    site: item.site ?? null,
  }))
}

export async function listManagerNotifications(unreadOnly = false): Promise<ManagerNotification[]> {
  const params = new URLSearchParams({ pageSize: '100' })
  if (unreadOnly) params.set('unread', '1')
  const response = await apiRequest<{ data: ManagerNotification[] }>(`/api/v1/notifications?${params}`)
  return response.data ?? []
}

export async function markManagerNotificationRead(id: string): Promise<void> {
  await apiRequest(`/api/v1/notifications/${id}/read`, { method: 'PATCH' })
}

export async function markAllManagerNotificationsRead(): Promise<void> {
  await apiRequest('/api/v1/notifications/read', { method: 'POST' })
}

