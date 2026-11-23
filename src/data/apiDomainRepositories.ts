import type { Department, EmployeeDocumentRecord, Holiday, LeaveRequest, OffboardingRequest, OnboardingRequest } from '../types/models'
import type { MockRepository, RepositoryPage } from './mockRepository'
import { apiData, apiFile, apiRequest, apiUpload } from '../lib/apiClient'

export const apiLeaveRepository: MockRepository<LeaveRequest> = {
  async list(): Promise<RepositoryPage<LeaveRequest>> {
    // The backend returns a BARE paginated page {data, page, pageSize, total,
    // meta} for GET /api/v1/leave-requests (not an enveloped array), so read
    // the page directly instead of unwrapping it with apiData.
    const response = await apiRequest<{ data: ApiLeaveRequest[]; page: number; pageSize: number; total: number }>('/api/v1/leave-requests')
    const data: LeaveRequest[] = response.data.map(toApiLeaveRequest)
    return { data, page: response.page, pageSize: response.pageSize, total: response.total }
  },
  async get(id) {
    const list = await this.list()
    return list.data.find((l) => l.id === id) ?? null
  },
  async create(input) {
    const res = await apiData<ApiLeaveRequest>('/api/v1/leave-requests', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: input.userId,
        leave_type_id: input.typeId,
        start_date: input.start,
        end_date: input.end,
        from_half: input.fromHalf,
        to_half: input.toHalf,
        duration: input.duration,
        backup_employee_id: input.backupUserId,
        note: input.note,
      }),
    })
    return toApiLeaveRequest(res)
  },
  async update() {
    throw new Error('Leave status decisions must be made through the workflow API.')
  },
  async delete(id) {
    await apiData(`/api/v1/leave-requests/${id}`, { method: 'DELETE' })
    return true
  },
}

interface ApiLeaveRequest {
  id: string
  employee_id: number
  employee?: { first_name: string; last_name: string } | null
  leave_type_id: string
  leave_type?: { name_key: string } | null
  start_date: string
  end_date: string
  from_half: 'full' | 'AM' | 'PM'
  to_half: 'full' | 'AM' | 'PM'
  duration: number
  backup_employee_id: number | null
  backup_employee?: { first_name: string; last_name: string } | null
  note: string | null
  status: LeaveRequest['status']
  submitted_at: string
}

function toApiLeaveRequest(item: ApiLeaveRequest): LeaveRequest {
  const employee = item.employee
  const backupEmployee = item.backup_employee
  return {
    id: String(item.id),
    userId: item.employee_id,
    employee: employee ? `${employee.first_name} ${employee.last_name}`.trim() : '',
    typeId: String(item.leave_type_id),
    type: item.leave_type?.name_key ?? '',
    start: item.start_date,
    end: item.end_date,
    fromHalf: item.from_half,
    toHalf: item.to_half,
    duration: Number(item.duration),
    backup: backupEmployee ? `${backupEmployee.first_name} ${backupEmployee.last_name}`.trim() : '',
    backupUserId: item.backup_employee_id ?? null,
    note: item.note ?? '',
    status: item.status,
    submittedAt: item.submitted_at,
  }
}

export const apiDepartmentRepository: MockRepository<Department> = {
  async list(): Promise<RepositoryPage<Department>> {
    const response = await apiData<any[]>('/api/v1/departments')
    const data: Department[] = response.map((item) => ({
      id: item.id?.toString() ?? '',
      name: item.name ?? '',
      code: item.code ?? '',
      manager: item.manager ?? '',
      employeeCount: item.employee_count ?? 0,
      budget: item.budget ?? '$0',
    }))
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const list = await this.list()
    return list.data.find((d) => d.id === id) ?? null
  },
  async create(input) {
    const res = await apiData<any>('/api/v1/departments', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return {
      id: res.id?.toString() ?? '',
      name: res.name ?? '',
      code: res.code ?? '',
      manager: res.manager ?? '',
      employeeCount: res.employee_count ?? 0,
      budget: res.budget ?? '$0',
    }
  },
  async update(id, input) {
    const res = await apiData<any>(`/api/v1/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    return {
      id: res.id?.toString() ?? '',
      name: res.name ?? '',
      code: res.code ?? '',
      manager: res.manager ?? '',
      employeeCount: res.employee_count ?? 0,
      budget: res.budget ?? '$0',
    }
  },
  async delete(id) {
    await apiData(`/api/v1/departments/${id}`, { method: 'DELETE' })
    return true
  },
}

export const apiHolidayRepository: MockRepository<Holiday> = {
  async list(): Promise<RepositoryPage<Holiday>> {
    const response = await apiData<any[]>('/api/v1/holidays')
    const data: Holiday[] = response.map((item) => ({
      id: item.id?.toString() ?? '',
      name: item.name ?? '',
      nameKey: item.name_key ?? undefined,
      date: item.date ?? '',
      days: item.days ?? 1,
      recurring: item.recurring ?? false,
      type: item.type ?? 'Public',
      country: item.country ?? null,
      site: item.site ?? null,
    }))
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const list = await this.list()
    return list.data.find((h) => h.id === id) ?? null
  },
  async create(input) {
    const res = await apiData<any>('/api/v1/holidays', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return {
      id: res.id?.toString() ?? '',
      name: res.name ?? '',
      nameKey: res.name_key ?? undefined,
      date: res.date ?? '',
      days: res.days ?? 1,
      recurring: res.recurring ?? false,
      type: res.type ?? 'Public',
      country: res.country ?? null,
      site: res.site ?? null,
    }
  },
  async update(id, input) {
    const res = await apiData<any>(`/api/v1/holidays/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    return {
      id: res.id?.toString() ?? '',
      name: res.name ?? '',
      nameKey: res.name_key ?? undefined,
      date: res.date ?? '',
      days: res.days ?? 1,
      recurring: res.recurring ?? false,
      type: res.type ?? 'Public',
      country: res.country ?? null,
      site: res.site ?? null,
    }
  },
  async delete(id) {
    await apiData(`/api/v1/holidays/${id}`, { method: 'DELETE' })
    return true
  },
}


export const apiOnboardingRepository: MockRepository<OnboardingRequest> = {
  async list(): Promise<RepositoryPage<OnboardingRequest>> {
    const response = await apiData<any[]>('/api/v1/onboarding-cases')
    const data: OnboardingRequest[] = response.map((item) => ({
      id: item.id?.toString() ?? '',
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
        id: t.id?.toString() ?? '',
        labelKey: t.label_key ?? '',
        done: t.done ?? false,
        dueDate: t.due_date ?? undefined,
        employeeVisible: t.employee_visible ?? true,
      })),
    }))
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const res = await apiData<any>(`/api/v1/onboarding-cases/${id}`)
    return {
      id: res.id?.toString() ?? '',
      userId: res.employee_id ?? null,
      employee: res.employee_name ?? '',
      position: res.position ?? '',
      department: res.department ?? '',
      startDate: res.start_date ?? '',
      stage: res.stage ?? 'HR Validation',
      assignee: res.assignee ?? 'HR Team',
      progress: res.progress ?? 0,
      status: res.status ?? 'On track',
      approvalStatus: res.approval_status ?? null,
      employeeTasks: (res.tasks ?? []).map((t: any) => ({
        id: t.id?.toString() ?? '',
        labelKey: t.label_key ?? '',
        done: t.done ?? false,
        dueDate: t.due_date ?? undefined,
        employeeVisible: t.employee_visible ?? true,
      })),
    }
  },
  async create(input) {
    const res = await apiData<any>('/api/v1/onboarding-cases', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: input.userId,
        employee_name: input.employee,
        position: input.position,
        department: input.department,
        start_date: input.startDate,
        assignee: input.assignee,
      }),
    })
    return {
      id: res.id?.toString() ?? '',
      userId: res.employee_id ?? null,
      employee: res.employee_name ?? '',
      position: res.position ?? '',
      department: res.department ?? '',
      startDate: res.start_date ?? '',
      stage: res.stage ?? 'HR Validation',
      assignee: res.assignee ?? 'HR Team',
      progress: res.progress ?? 0,
      status: res.status ?? 'On track',
      approvalStatus: res.approval_status ?? null,
      employeeTasks: [],
    }
  },
  async update(id, input) {
    const res = await apiData<any>(`/api/v1/onboarding-cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        employee_name: input.employee,
        position: input.position,
        department: input.department,
        start_date: input.startDate,
        assignee: input.assignee,
        status: input.status,
      }),
    })
    return {
      id: res.id?.toString() ?? '',
      userId: res.employee_id ?? null,
      employee: res.employee_name ?? '',
      position: res.position ?? '',
      department: res.department ?? '',
      startDate: res.start_date ?? '',
      stage: res.stage ?? 'HR Validation',
      assignee: res.assignee ?? 'HR Team',
      progress: res.progress ?? 0,
      status: res.status ?? 'On track',
      approvalStatus: res.approval_status ?? null,
      employeeTasks: (res.tasks ?? []).map((task: any) => ({
        id: task.id?.toString() ?? '',
        labelKey: task.label_key ?? '',
        done: task.done ?? false,
        dueDate: task.due_date ?? undefined,
        employeeVisible: task.employee_visible ?? true,
      })),
    }
  },
  async delete(id) {
    await apiData(`/api/v1/onboarding-cases/${id}`, { method: 'DELETE' })
    return true
  },
}


export const apiOffboardingRepository: MockRepository<OffboardingRequest> = {
  async list(): Promise<RepositoryPage<OffboardingRequest>> {
    const response = await apiData<any[]>('/api/v1/offboarding-cases')
    const data: OffboardingRequest[] = response.map((item) => ({
      id: item.id?.toString() ?? '',
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
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const res = await apiData<any>(`/api/v1/offboarding-cases/${id}`)
    return {
      id: res.id?.toString() ?? '',
      userId: res.employee_id ?? null,
      employee: res.employee_name ?? '',
      exitDate: res.exit_date ?? '',
      reason: res.reason ?? '',
      replacement: res.replacement ?? '',
      stage: res.stage ?? 'Pending',
      progress: res.progress ?? 0,
      status: res.status ?? 'On track',
      approvalStatus: res.approval_status ?? null,
    }
  },
  async create(input) {
    const res = await apiData<any>('/api/v1/offboarding-cases', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: input.userId,
        employee_name: input.employee,
        exit_date: input.exitDate,
        reason: input.reason,
        replacement: input.replacement,
      }),
    })
    return {
      id: res.id?.toString() ?? '',
      userId: res.employee_id ?? null,
      employee: res.employee_name ?? '',
      exitDate: res.exit_date ?? '',
      reason: res.reason ?? '',
      replacement: res.replacement ?? '',
      stage: res.stage ?? 'Pending',
      progress: res.progress ?? 0,
      status: res.status ?? 'On track',
      approvalStatus: res.approval_status ?? null,
    }
  },
  async update(id, input) {
    const res = await apiData<any>(`/api/v1/offboarding-cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        employee_name: input.employee,
        exit_date: input.exitDate,
        reason: input.reason,
        replacement: input.replacement,
        stage: input.stage,
        progress: input.progress,
        status: input.status,
      }),
    })
    return {
      id: res.id?.toString() ?? '',
      userId: res.employee_id ?? null,
      employee: res.employee_name ?? '',
      exitDate: res.exit_date ?? '',
      reason: res.reason ?? '',
      replacement: res.replacement ?? '',
      stage: res.stage ?? 'Pending',
      progress: res.progress ?? 0,
      status: res.status ?? 'On track',
      approvalStatus: res.approval_status ?? null,
    }
  },
  async delete(id) {
    await apiData(`/api/v1/offboarding-cases/${id}`, { method: 'DELETE' })
    return true
  },
}

interface ApiDocument {
  id: string
  employee_id: number | string
  employee?: { first_name: string; last_name: string; name?: string } | null
  name: string
  type: string
  uploaded_at: string | null
  issue_date?: string | null
  expiry_date: string | null
  status: string
  has_file: boolean
  mime_type?: string | null
  file_size?: number | null
  review_comment?: string | null
  reviewed_at?: string | null
  workflow_instance?: { id: string; status: string } | null
}

function toApiDocument(item: ApiDocument): EmployeeDocumentRecord {
  return {
    id: String(item.id),
    employeeId: String(item.employee_id),
    employee: item.employee?.name ?? [item.employee?.first_name, item.employee?.last_name].filter(Boolean).join(' '),
    name: item.name ?? '',
    type: item.type ?? '',
    uploadedAt: item.uploaded_at ?? '',
    issueDate: item.issue_date ?? null,
    expiryDate: item.expiry_date ?? null,
    status: item.status ?? 'missing',
    hasFile: item.has_file ?? false,
    mimeType: item.mime_type ?? null,
    fileSize: item.file_size ?? null,
    reviewComment: item.review_comment ?? null,
    reviewedAt: item.reviewed_at ?? null,
    workflowInstance: item.workflow_instance ?? null,
  }
}

export const apiDocumentRepository: MockRepository<EmployeeDocumentRecord> = {
  async list(): Promise<RepositoryPage<EmployeeDocumentRecord>> {
    const response = await apiData<ApiDocument[]>('/api/v1/employee-documents')
    const data = response.map(toApiDocument)
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    return toApiDocument(await apiData<ApiDocument>(`/api/v1/employee-documents/${id}`))
  },
  async create(input) {
    const res = await apiData<ApiDocument>('/api/v1/employee-documents', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: input.employeeId,
        name: input.name,
        type: input.type,
        issue_date: input.issueDate,
        expiry_date: input.expiryDate,
      }),
    })
    return toApiDocument(res)
  },
  async update(id, input) {
    const res = await apiData<ApiDocument>(`/api/v1/employee-documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: input.name,
        type: input.type,
        issue_date: input.issueDate,
        expiry_date: input.expiryDate,
      }),
    })
    return toApiDocument(res)
  },
  async delete(id) {
    await apiData(`/api/v1/employee-documents/${id}`, { method: 'DELETE' })
    return true
  },
}

export const apiDocumentActions = {
  async list(filters: {
    search?: string
    employeeId?: string
    category?: string
    status?: string
    expiresBefore?: string
    expiresAfter?: string
    hasExpiry?: boolean
  } = {}) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
    const response = await apiData<ApiDocument[]>(`/api/v1/employee-documents?${params}`)
    return response.map(toApiDocument)
  },
  async upload(id: string, file: File, onProgress?: (percentage: number) => void) {
    const body = new FormData()
    body.append('file', file)
    const response = await apiUpload<{ data: ApiDocument }>(`/api/v1/employee-documents/${id}/file`, body, onProgress)
    return toApiDocument(response.data)
  },
  async review(id: string, status: 'approved' | 'rejected', comment: string) {
    const response = await apiData<ApiDocument>(`/api/v1/employee-documents/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ status, comment }),
    })
    return toApiDocument(response)
  },
  async archive(id: string) {
    const response = await apiData<ApiDocument>(`/api/v1/employee-documents/${id}/archive`, { method: 'POST' })
    return toApiDocument(response)
  },
  async remove(id: string) {
    await apiData(`/api/v1/employee-documents/${id}`, { method: 'DELETE' })
  },
  file: apiFile,
}
