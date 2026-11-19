import type {
  Employee,
  EmployeeDocumentRecord,
  EmployeeLeaveEntitlement,
  Holiday,
  LeaveRequest,
  LeaveType,
  OffboardingRequest,
  OnboardingRequest,
} from '../types/models'
import { apiData, apiRequest } from '../lib/apiClient'
import type { MockRepository, RepositoryPage, RepositoryQuery } from './mockRepository'

interface ApiEmployee {
  id: number
  firstName: string
  lastName: string
  jobTitle: string
  departmentId?: string | null
  department?: string | null
  team?: string | null
  positionTitle?: string | null
  position?: string | null
  teamId?: string | null
  positionId?: string | null
  managerId?: number | null
  manager?: string | null
  employmentType?: Employee['employmentType'] | null
  status: Employee['status']
  location?: string | null
  country?: string | null
  joined?: string | null
  email?: string | null
  userId?: string | null
  gender?: Employee['gender'] | null
  maritalStatus?: Employee['maritalStatus'] | null
  numberOfChildren?: number | null
  nationalId?: string | null
  nationalityId?: number | null
  passportNumber?: string | null
  passportValidityDate?: string | null
  personalPhone?: string | null
  professionalPhone?: string | null
  personalInfoCompletedAt?: string | null
  personalInfoDismissedUntil?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelationship?: string | null
  onboardingStatus?: string | null
  onboardingApprovalStatus?: string | null
  offboardingStatus?: string | null
  offboardingApprovalStatus?: string | null
  documentStatusCounts?: Employee['documentStatusCounts']
  createdAt?: string | null
  updatedAt?: string | null
}

interface ApiEmployeePage {
  data: ApiEmployee[]
  page: number
  pageSize: number
  total: number
}

export interface ApiDashboardNotification {
  id: string
  title: string
  body: string | null
  type: string
  resource_type: string | null
  resource_id: string | null
  created_at: string
  read_at: string | null
}

export interface EmployeeDashboardData {
  employee: Employee
  leaveRequests: LeaveRequest[]
  leaveTypes: LeaveType[]
  leaveEntitlements: EmployeeLeaveEntitlement[]
  onboardingCases: OnboardingRequest[]
  offboardingCases: OffboardingRequest[]
  documents: EmployeeDocumentRecord[]
  holidays: Holiday[]
  notifications: ApiDashboardNotification[]
  unreadCount: number
}

interface ApiEmployeeSummary {
  employee: ApiEmployee
  leaveRequests: Array<{
    id: string
    employee_id: number
    employee?: { first_name: string; last_name: string } | null
    leave_type_id: string
    leave_type?: { name_key: string } | null
    start_date: string
    end_date: string
    from_half: 'full' | 'AM' | 'PM'
    to_half: 'full' | 'AM' | 'PM'
    duration: number | string
    backup_employee_id: number | null
    backup_employee?: { first_name: string; last_name: string } | null
    note: string | null
    status: LeaveRequest['status']
    submitted_at: string
  }>
  leaveTypes: Array<{ id: string; code: string; name_key: string; color: string; paid: boolean }>
  leaveEntitlements: Array<{ employee_id: number; leave_type_id: string; entitlement: number | string }>
  onboardingCases: Array<{
    id: string
    employee_id: number | null
    employee_name: string
    position: string
    department: string
    start_date: string
    stage: string
    assignee: string | null
    progress: number
    status: string
    approval_status?: string | null
    tasks: Array<{
      id: string
      label_key: string
      done: boolean
      due_date: string | null
      employee_visible: boolean
    }>
  }>
  offboardingCases: Array<{
    id: string
    employee_id: number | null
    employee_name: string
    exit_date: string
    reason: string
    replacement: string | null
    stage: string
    progress: number
    status: string
    approval_status?: string | null
  }>
  documents: Array<{
    id: string
    employee_id: number
    name: string
    type: string
    uploaded_at: string
    expiry_date: string | null
    status: string
    has_file: boolean
  }>
  holidays: Array<{
    id: string
    name: string
    name_key: string | null
    date: string
    days: number
    recurring: boolean
    type: Holiday['type']
    country: string | null
    site: string | null
  }>
  notifications: ApiDashboardNotification[]
  unreadCount: number
}

export function toEmployee(source: ApiEmployee): Employee {
  return {
    id: source.id,
    departmentId: source.departmentId ?? null,
    teamId: source.teamId ?? null,
    positionId: source.positionId ?? null,
    managerId: source.managerId ?? null,
    firstName: source.firstName,
    lastName: source.lastName,
    jobTitle: source.jobTitle,
    department: source.department ?? '',
    team: source.team ?? '',
    positionTitle: source.positionTitle ?? source.position ?? '',
    manager: source.manager ?? '',
    employmentType: source.employmentType ?? null,
    status: source.status,
    location: source.location ?? '',
    country: source.country ?? '',
    joined: source.joined ?? '',
    email: source.email ?? '',
    initials: `${source.firstName[0] ?? ''}${source.lastName[0] ?? ''}`.toUpperCase(),
    userId: source.id,
    authUserId: source.userId ?? null,
    gender: source.gender ?? null,
    maritalStatus: source.maritalStatus ?? null,
    numberOfChildren: source.numberOfChildren ?? null,
    nationalId: source.nationalId ?? null,
    nationalityId: source.nationalityId ?? null,
    passportNumber: source.passportNumber ?? null,
    passportValidityDate: source.passportValidityDate ?? null,
    personalPhone: source.personalPhone ?? null,
    professionalPhone: source.professionalPhone ?? null,
    personalInfoCompletedAt: source.personalInfoCompletedAt ?? null,
    personalInfoDismissedUntil: source.personalInfoDismissedUntil ?? null,
    emergencyContactName: source.emergencyContactName ?? null,
    emergencyContactPhone: source.emergencyContactPhone ?? null,
    emergencyContactRelationship: source.emergencyContactRelationship ?? null,
    onboardingStatus: source.onboardingStatus ?? null,
    onboardingApprovalStatus: source.onboardingApprovalStatus ?? null,
    offboardingStatus: source.offboardingStatus ?? null,
    offboardingApprovalStatus: source.offboardingApprovalStatus ?? null,
    documentStatusCounts: source.documentStatusCounts ?? null,
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
  }
}

function employeePayload(employee: Partial<Employee>): Record<string, unknown> {
  const fields: Partial<Record<keyof Employee, string>> = {
    firstName: 'first_name',
    lastName: 'last_name',
    jobTitle: 'job_title',
    departmentId: 'department_id',
    teamId: 'team_id',
    positionId: 'position_id',
    employmentType: 'employment_type',
    status: 'status',
    location: 'location',
    country: 'country',
    joined: 'joined_at',
    email: 'email',
    gender: 'gender',
    maritalStatus: 'marital_status',
    numberOfChildren: 'number_of_children',
    nationalId: 'national_id',
    nationalityId: 'nationality_id',
    passportNumber: 'passport_number',
    passportValidityDate: 'passport_validity_date',
    personalPhone: 'personal_phone',
    professionalPhone: 'professional_phone',
    personalInfoCompletedAt: 'personal_info_completed_at',
    personalInfoDismissedUntil: 'personal_info_dismissed_until',
    emergencyContactName: 'emergency_contact_name',
    emergencyContactPhone: 'emergency_contact_phone',
    emergencyContactRelationship: 'emergency_contact_relationship',
  }
  return Object.fromEntries(
    Object.entries(employee)
      .filter(([key]) => key in fields)
      .map(([key, value]) => [fields[key as keyof Employee], value]),
  )
}

const apiEmployeeRepository: MockRepository<Employee> & { getSummary: () => Promise<EmployeeDashboardData> } = {
  async list(query: RepositoryQuery<Employee> = {}): Promise<RepositoryPage<Employee>> {
    const params = new URLSearchParams()
    params.set('page', String(query.page ?? 1))
    params.set('pageSize', String(query.pageSize ?? 25))
    if (query.search?.trim()) params.set('q', query.search.trim())
    if (query.where?.status) params.set('status', String(query.where.status))
    if (query.sortBy) {
      const apiSort: Partial<Record<keyof Employee, string>> = {
        id: 'id',
        firstName: 'first_name',
        lastName: 'last_name',
        jobTitle: 'job_title',
        department: 'department',
        team: 'team',
        positionTitle: 'position',
        manager: 'manager',
        employmentType: 'employment_type',
        status: 'status',
        location: 'location',
        country: 'country',
        joined: 'joined_at',
        email: 'email',
        gender: 'gender',
        maritalStatus: 'marital_status',
        numberOfChildren: 'number_of_children',
        nationalityId: 'nationality_id',
        nationalId: 'national_id',
        passportNumber: 'passport_number',
        passportValidityDate: 'passport_validity_date',
        personalPhone: 'personal_phone',
        professionalPhone: 'professional_phone',
        personalInfoCompletedAt: 'personal_info_completed_at',
        onboardingStatus: 'onboarding_status',
        offboardingStatus: 'offboarding_status',
        documentStatusCounts: 'document_status',
        emergencyContactName: 'emergency_contact_name',
        emergencyContactPhone: 'emergency_contact_phone',
        emergencyContactRelationship: 'emergency_contact_relationship',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      }
      const sort = apiSort[query.sortBy]
      if (sort) params.set('sort', sort)
    }
    Object.entries(query.columnFilters ?? {}).forEach(([field, value]) => {
      if (typeof value === 'string') {
        if (value) params.set(`filters[${field}]`, value)
      } else {
        Object.entries(value).forEach(([key, filterValue]) => {
          if (filterValue !== undefined && filterValue !== '') params.set(`filters[${field}][${key}]`, String(filterValue))
        })
      }
    })
    if (query.sortDirection) params.set('order', query.sortDirection)

    const response = await apiRequest<ApiEmployeePage>(`/api/v1/employees?${params}`)
    return {
      data: response.data.map(toEmployee),
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
    }
  },
  async get(id) {
    const employee = await apiData<ApiEmployee>(`/api/v1/employees/${id}`)
    return toEmployee(employee)
  },
  async create(input) {
    const employee = await apiData<ApiEmployee>('/api/v1/employees', {
      method: 'POST',
      body: JSON.stringify(employeePayload(input)),
    })
    return toEmployee(employee)
  },
  async update(id, updates) {
    const employee = await apiData<ApiEmployee>(`/api/v1/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(employeePayload(updates)),
    })
    return toEmployee(employee)
  },
  async getSummary() {
    const response = await apiRequest<ApiEmployeeSummary>('/api/v1/employees/summary')
    return {
      employee: toEmployee(response.employee),
      leaveRequests: response.leaveRequests.map((item) => ({
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
      leaveTypes: response.leaveTypes.map((item) => ({
        id: item.id,
        code: item.code,
        nameKey: item.name_key,
        color: item.color,
        paid: item.paid,
      })),
      leaveEntitlements: response.leaveEntitlements.map((item) => ({
        userId: item.employee_id,
        typeId: item.leave_type_id,
        entitlement: Number(item.entitlement),
      })),
      onboardingCases: response.onboardingCases.map((item) => ({
        id: item.id,
        userId: item.employee_id,
        employee: item.employee_name,
        position: item.position,
        department: item.department,
        startDate: item.start_date,
        stage: item.stage as OnboardingRequest['stage'],
        assignee: item.assignee ?? '',
        progress: item.progress,
        status: item.status as OnboardingRequest['status'],
        approvalStatus: item.approval_status ?? null,
        employeeTasks: item.tasks.map((task) => ({
          id: task.id,
          labelKey: task.label_key,
          done: task.done,
          dueDate: task.due_date ?? undefined,
          employeeVisible: task.employee_visible,
        })),
      })),
      offboardingCases: response.offboardingCases.map((item) => ({
        id: item.id,
        userId: item.employee_id,
        employee: item.employee_name,
        exitDate: item.exit_date,
        reason: item.reason,
        replacement: item.replacement ?? '',
        stage: item.stage,
        progress: item.progress,
        status: item.status as OffboardingRequest['status'],
        approvalStatus: item.approval_status ?? null,
      })),
      documents: response.documents.map((item) => ({
        id: item.id,
        employeeId: String(item.employee_id),
        employee: '',
        name: item.name,
        type: item.type,
        uploadedAt: item.uploaded_at,
        expiryDate: item.expiry_date,
        status: item.status,
        hasFile: item.has_file,
      })),
      holidays: response.holidays.map((item) => ({
        id: item.id,
        name: item.name,
        nameKey: item.name_key ?? undefined,
        date: item.date,
        days: item.days,
        recurring: item.recurring,
        type: item.type,
        country: item.country,
        site: item.site,
      })),
      notifications: response.notifications,
      unreadCount: response.unreadCount,
    }
  },

  async delete(id) {
    await apiRequest<void>(`/api/v1/employees/${id}`, { method: 'DELETE' })
    return true
  },
}

export { apiEmployeeRepository }
