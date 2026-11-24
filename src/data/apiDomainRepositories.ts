import type { AttendanceRecord, Department, EmployeeDocumentRecord, Goal, Holiday, LeaveRequest, OffboardingRequest, OnboardingRequest, PerformanceReview, ReviewCycle, TrainingCourse, TrainingEnrollment } from '../types/models'
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

function toApiDepartment(item: any): Department {
  return {
    id: item.id?.toString() ?? '',
    name: item.name ?? '',
    code: item.code ?? '',
    manager: item.manager ?? '',
    managerId: item.manager_id ?? null,
    description: item.description ?? '',
    employeeCount: item.employee_count ?? 0,
    budget: item.budget ?? '$0',
    parentId: item.parent_id ?? null,
    isActive: item.is_active ?? true,
  }
}

function toApiDepartmentBody(input: Partial<Department> & { id?: string }) {
  const budgetNumber =
    typeof input.budget === 'string'
      ? Number(input.budget.replace(/[^0-9.]/g, '')) || null
      : (input.budget ?? null)
  return {
    id: input.id ?? undefined,
    name: input.name,
    code: input.code ?? null,
    description: input.description ?? null,
    manager_id: input.managerId ?? null,
    budget: budgetNumber,
    parent_id: input.parentId ?? null,
    is_active: input.isActive ?? true,
  }
}

export const apiDepartmentRepository: MockRepository<Department> = {
  async list(): Promise<RepositoryPage<Department>> {
    const response = await apiData<any[]>('/api/v1/departments')
    const data: Department[] = response.map(toApiDepartment)
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const list = await this.list()
    return list.data.find((d) => d.id === id) ?? null
  },
  async create(input) {
    // The backend needs a short string id (e.g. "eng"); the page passes it
    // through the input object even though the repository type omits it.
    const res = await apiData<any>('/api/v1/departments', {
      method: 'POST',
      body: JSON.stringify(toApiDepartmentBody(input as Partial<Department> & { id?: string })),
    })
    return toApiDepartment(res)
  },
  async update(id, input) {
    const res = await apiData<any>(`/api/v1/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(toApiDepartmentBody(input)),
    })
    return toApiDepartment(res)
  },
  async delete(id) {
    await apiData(`/api/v1/departments/${id}`, { method: 'DELETE' })
    return true
  },
}

/** Calendar custom events — server-backed (see /api/v1/calendar-events). */
export interface CalendarEventRecord {
  id: string
  title: string
  type: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  note: string
}

interface ApiCalendarEvent {
  id: number | string
  user_id: string | null
  title: string
  type: string
  start_date: string
  end_date: string
  note: string | null
}

function toCalendarEventRecord(item: ApiCalendarEvent): CalendarEventRecord {
  return {
    id: String(item.id),
    title: item.title ?? '',
    type: item.type ?? 'Company event',
    start: item.start_date ?? '',
    end: item.end_date ?? item.start_date ?? '',
    note: item.note ?? '',
  }
}

export const apiCalendarEventRepository = {
  async list(): Promise<CalendarEventRecord[]> {
    const response = await apiData<ApiCalendarEvent[]>('/api/v1/calendar-events')
    return response.map(toCalendarEventRecord)
  },
  async create(input: Omit<CalendarEventRecord, 'id'>): Promise<CalendarEventRecord> {
    const res = await apiData<ApiCalendarEvent>('/api/v1/calendar-events', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        type: input.type,
        start_date: input.start,
        end_date: input.end,
        note: input.note,
      }),
    })
    return toCalendarEventRecord(res)
  },
  async remove(id: string): Promise<void> {
    await apiData(`/api/v1/calendar-events/${id}`, { method: 'DELETE' })
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

interface ApiTrainingCourse {
  id: number | string
  title: string
  description: string | null
  category: string
  duration_hours: number
  provider: string | null
  status: TrainingCourse['status']
  enrollments_count: number
}

function toTrainingCourse(item: ApiTrainingCourse): TrainingCourse {
  return {
    id: String(item.id),
    title: item.title ?? '',
    description: item.description ?? '',
    category: item.category ?? 'General',
    durationHours: Number(item.duration_hours ?? 0),
    provider: item.provider ?? '',
    status: item.status ?? 'active',
    enrollmentsCount: Number(item.enrollments_count ?? 0),
  }
}

function toTrainingCourseBody(input: Partial<TrainingCourse>) {
  return {
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? 'General',
    duration_hours: input.durationHours ?? 0,
    provider: input.provider ?? null,
    status: input.status ?? 'active',
  }
}

export const apiTrainingCourseRepository: MockRepository<TrainingCourse> = {
  async list(): Promise<RepositoryPage<TrainingCourse>> {
    const response = await apiData<ApiTrainingCourse[]>('/api/v1/training-courses')
    const data = response.map(toTrainingCourse)
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const list = await this.list()
    return list.data.find((c) => c.id === id) ?? null
  },
  async create(input) {
    const res = await apiData<ApiTrainingCourse>('/api/v1/training-courses', {
      method: 'POST',
      body: JSON.stringify(toTrainingCourseBody(input)),
    })
    return toTrainingCourse(res)
  },
  async update(id, input) {
    const res = await apiData<ApiTrainingCourse>(`/api/v1/training-courses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(toTrainingCourseBody(input)),
    })
    return toTrainingCourse(res)
  },
  async delete(id) {
    await apiData(`/api/v1/training-courses/${id}`, { method: 'DELETE' })
    return true
  },
}

interface ApiTrainingEnrollment {
  id: number | string
  employee_id: number
  employee: string | null
  course_id: number | string
  course: string | null
  status: TrainingEnrollment['status']
  progress: number
  completed_at: string | null
}

function toTrainingEnrollment(item: ApiTrainingEnrollment): TrainingEnrollment {
  return {
    id: String(item.id),
    employeeId: Number(item.employee_id),
    employee: item.employee ?? '',
    courseId: String(item.course_id),
    course: item.course ?? '',
    status: item.status ?? 'enrolled',
    progress: Number(item.progress ?? 0),
    completedAt: item.completed_at ?? null,
  }
}

export const apiTrainingEnrollmentRepository: MockRepository<TrainingEnrollment> = {
  async list(): Promise<RepositoryPage<TrainingEnrollment>> {
    const response = await apiData<ApiTrainingEnrollment[]>('/api/v1/training-enrollments')
    const data = response.map(toTrainingEnrollment)
    return { data, page: 1, pageSize: data.length, total: data.length }
  },
  async get(id) {
    const list = await this.list()
    return list.data.find((e) => e.id === id) ?? null
  },
  async create(input) {
    const res = await apiData<ApiTrainingEnrollment>('/api/v1/training-enrollments', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: input.employeeId,
        course_id: Number(input.courseId),
      }),
    })
    return toTrainingEnrollment(res)
  },
  async update(id, input) {
    const res = await apiData<ApiTrainingEnrollment>(`/api/v1/training-enrollments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: input.status,
        progress: input.progress,
      }),
    })
    return toTrainingEnrollment(res)
  },
  async delete(id) {
    await apiData(`/api/v1/training-enrollments/${id}`, { method: 'DELETE' })
    return true
  },
}

interface ApiAttendanceRecord {
  id: number | string
  employee_id: number
  employee: string | null
  date: string
  check_in: string | null
  check_out: string | null
  status: AttendanceRecord['status']
  hours_worked: number | null
  validated: boolean
  validated_by: string | null
  notes: string | null
  source: AttendanceRecord['source']
  leave_request_id: string | null
}

function toAttendanceRecord(item: ApiAttendanceRecord): AttendanceRecord {
  return {
    id: String(item.id),
    employeeId: Number(item.employee_id),
    employee: item.employee ?? '',
    date: item.date ?? '',
    checkIn: item.check_in ?? null,
    checkOut: item.check_out ?? null,
    status: item.status ?? 'present',
    hoursWorked: item.hours_worked !== null && item.hours_worked !== undefined ? Number(item.hours_worked) : null,
    validated: Boolean(item.validated),
    validatedBy: item.validated_by ?? null,
    notes: item.notes ?? '',
    source: item.source ?? 'record',
    leaveRequestId: item.leave_request_id ?? null,
  }
}

export interface AttendanceFilters {
  from?: string
  to?: string
  employeeId?: number
}

/** Attendance — server-backed (see /api/v1/attendance-records). Manual check-in/out, no biometric, no import. */
export const apiAttendanceActions = {
  async list(filters: AttendanceFilters = {}): Promise<AttendanceRecord[]> {
    const params = new URLSearchParams()
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (filters.employeeId !== undefined) params.set('employee_id', String(filters.employeeId))
    const response = await apiData<ApiAttendanceRecord[]>(`/api/v1/attendance-records?${params}`)
    return response.map(toAttendanceRecord)
  },
  async save(input: {
    employeeId: number
    date: string
    checkIn?: string | null
    checkOut?: string | null
    status?: AttendanceRecord['status']
    notes?: string | null
  }): Promise<AttendanceRecord> {
    const res = await apiData<ApiAttendanceRecord>('/api/v1/attendance-records', {
      method: 'POST',
      body: JSON.stringify({
        employee_id: input.employeeId,
        date: input.date,
        check_in: input.checkIn ?? null,
        check_out: input.checkOut ?? null,
        status: input.status ?? undefined,
        notes: input.notes ?? null,
      }),
    })
    return toAttendanceRecord(res)
  },
  async update(id: string, input: {
    checkIn?: string | null
    checkOut?: string | null
    status?: AttendanceRecord['status']
    notes?: string | null
  }): Promise<AttendanceRecord> {
    const res = await apiData<ApiAttendanceRecord>(`/api/v1/attendance-records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        check_in: input.checkIn ?? undefined,
        check_out: input.checkOut ?? undefined,
        status: input.status ?? undefined,
        notes: input.notes ?? undefined,
      }),
    })
    return toAttendanceRecord(res)
  },
  async validate(id: string): Promise<AttendanceRecord> {
    const res = await apiData<ApiAttendanceRecord>(`/api/v1/attendance-records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ validated: true }),
    })
    return toAttendanceRecord(res)
  },
  async remove(id: string): Promise<void> {
    await apiData(`/api/v1/attendance-records/${id}`, { method: 'DELETE' })
  },
}

export interface PerformanceActions {
  listCycles: () => Promise<ReviewCycle[]>
  createCycle: (input: {
    title: string
    periodStart: string
    periodEnd: string
    status: string
  }) => Promise<ReviewCycle>
  updateCycle: (
    id: string,
    input: Partial<{ title: string; periodStart: string; periodEnd: string; status: string }>,
  ) => Promise<ReviewCycle>
  deleteCycle: (id: string) => Promise<void>
  listReviews: (filters?: { cycleId?: string; employeeId?: number }) => Promise<PerformanceReview[]>
  createReview: (input: {
    employeeId: number
    cycleId: number
    rating: number | null
    strengths: string | null
    improvements: string | null
    feedback: string | null
    status: string
  }) => Promise<PerformanceReview>
  updateReview: (
    id: string,
    input: Partial<{
      rating: number | null
      strengths: string | null
      improvements: string | null
      feedback: string | null
      status: string
    }>,
  ) => Promise<PerformanceReview>
  deleteReview: (id: string) => Promise<void>
  listGoals: (filters?: { employeeId?: number; status?: string }) => Promise<Goal[]>
  createGoal: (input: {
    employeeId: number
    title: string
    description: string | null
    targetDate: string | null
    status: string
    progress: number
  }) => Promise<Goal>
  updateGoal: (
    id: string,
    input: Partial<{
      title: string
      description: string | null
      targetDate: string | null
      status: string
      progress: number
    }>,
  ) => Promise<Goal>
  deleteGoal: (id: string) => Promise<void>
}

function cycleFromApi(row: Record<string, unknown>): ReviewCycle {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    periodStart: (row.period_start as string | null) ?? null,
    periodEnd: (row.period_end as string | null) ?? null,
    status: (row.status as ReviewCycle['status']) ?? 'draft',
    reviewsCount: (row.reviews_count as number | null) ?? null,
  }
}

function cycleToApi(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.title !== undefined) out.title = input.title
  if (input.periodStart !== undefined) out.period_start = input.periodStart
  if (input.periodEnd !== undefined) out.period_end = input.periodEnd
  if (input.status !== undefined) out.status = input.status
  return out
}

function reviewFromApi(row: Record<string, unknown>): PerformanceReview {
  return {
    id: String(row.id),
    employeeId: Number(row.employee_id),
    employee: (row.employee as string | null) ?? null,
    reviewerId: row.reviewer_id === null ? null : Number(row.reviewer_id),
    reviewer: (row.reviewer as string | null) ?? null,
    cycleId: String(row.cycle_id),
    cycle: (row.cycle as string | null) ?? null,
    rating: row.rating === null ? null : Number(row.rating),
    strengths: (row.strengths as string | null) ?? null,
    improvements: (row.improvements as string | null) ?? null,
    feedback: (row.feedback as string | null) ?? null,
    status: (row.status as PerformanceReview['status']) ?? 'draft',
  }
}

function reviewToApi(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.employeeId !== undefined) out.employee_id = input.employeeId
  if (input.cycleId !== undefined) out.cycle_id = input.cycleId
  if (input.reviewerId !== undefined) out.reviewer_id = input.reviewerId
  if (input.rating !== undefined) out.rating = input.rating
  if (input.strengths !== undefined) out.strengths = input.strengths
  if (input.improvements !== undefined) out.improvements = input.improvements
  if (input.feedback !== undefined) out.feedback = input.feedback
  if (input.status !== undefined) out.status = input.status
  return out
}

function goalFromApi(row: Record<string, unknown>): Goal {
  return {
    id: String(row.id),
    employeeId: Number(row.employee_id),
    employee: (row.employee as string | null) ?? null,
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    targetDate: (row.target_date as string | null) ?? null,
    status: (row.status as Goal['status']) ?? 'not_started',
    progress: Number(row.progress ?? 0),
  }
}

function goalToApi(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (input.employeeId !== undefined) out.employee_id = input.employeeId
  if (input.title !== undefined) out.title = input.title
  if (input.description !== undefined) out.description = input.description
  if (input.targetDate !== undefined) out.target_date = input.targetDate
  if (input.status !== undefined) out.status = input.status
  if (input.progress !== undefined) out.progress = input.progress
  return out
}

/** Performance — server-backed (see /api/v1/review-cycles, /performance-reviews, /goals). Rating scale 1-5. */
export const apiPerformanceActions: PerformanceActions = {
  async listCycles() {
    const rows = await apiData<Record<string, unknown>[]>('/api/v1/review-cycles')
    return rows.map(cycleFromApi)
  },
  async createCycle(input) {
    const row = await apiData<Record<string, unknown>>('/api/v1/review-cycles', {
      method: 'POST',
      body: JSON.stringify(cycleToApi(input as unknown as Record<string, unknown>)),
    })
    return cycleFromApi(row)
  },
  async updateCycle(id, input) {
    const row = await apiData<Record<string, unknown>>(`/api/v1/review-cycles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(cycleToApi(input as unknown as Record<string, unknown>)),
    })
    return cycleFromApi(row)
  },
  async deleteCycle(id) {
    await apiData(`/api/v1/review-cycles/${id}`, { method: 'DELETE' })
  },
  async listReviews(filters) {
    const params = new URLSearchParams()
    if (filters?.cycleId) params.set('cycle_id', filters.cycleId)
    if (filters?.employeeId !== undefined) params.set('employee_id', String(filters.employeeId))
    const query = params.toString()
    const rows = await apiData<Record<string, unknown>[]>(
      `/api/v1/performance-reviews${query ? `?${query}` : ''}`,
    )
    return rows.map(reviewFromApi)
  },
  async createReview(input) {
    const row = await apiData<Record<string, unknown>>('/api/v1/performance-reviews', {
      method: 'POST',
      body: JSON.stringify(reviewToApi(input as unknown as Record<string, unknown>)),
    })
    return reviewFromApi(row)
  },
  async updateReview(id, input) {
    const row = await apiData<Record<string, unknown>>(`/api/v1/performance-reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(reviewToApi(input as unknown as Record<string, unknown>)),
    })
    return reviewFromApi(row)
  },
  async deleteReview(id) {
    await apiData(`/api/v1/performance-reviews/${id}`, { method: 'DELETE' })
  },
  async listGoals(filters) {
    const params = new URLSearchParams()
    if (filters?.employeeId !== undefined) params.set('employee_id', String(filters.employeeId))
    if (filters?.status) params.set('status', filters.status)
    const query = params.toString()
    const rows = await apiData<Record<string, unknown>[]>(
      `/api/v1/goals${query ? `?${query}` : ''}`,
    )
    return rows.map(goalFromApi)
  },
  async createGoal(input) {
    const row = await apiData<Record<string, unknown>>('/api/v1/goals', {
      method: 'POST',
      body: JSON.stringify(goalToApi(input as unknown as Record<string, unknown>)),
    })
    return goalFromApi(row)
  },
  async updateGoal(id, input) {
    const row = await apiData<Record<string, unknown>>(`/api/v1/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(goalToApi(input as unknown as Record<string, unknown>)),
    })
    return goalFromApi(row)
  },
  async deleteGoal(id) {
    await apiData(`/api/v1/goals/${id}`, { method: 'DELETE' })
  },
}
