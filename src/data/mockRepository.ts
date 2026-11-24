import {
  createEmployee,
  createLeaveRequest,
  createOffboardingTask,
  createOnboardingTask,
  deleteEmployee,
  deleteLeaveRequest,
  deleteOffboardingTask,
  deleteOnboardingTask,
  getEmployeeById,
  getEmployees,
  getHolidays,
  getLeaveRequests,
  getOffboardingTasks,
  getOnboardingRequests,
  resetDemoData as resetStoredDemoData,
  updateLeaveRequest,
  updateOffboardingTask,
  updateEmployee,
  updateOnboardingTask,
} from './employeeStore'
import type { Department, Employee, EmployeeDocumentRecord, Holiday, LeaveRequest, OffboardingRequest, OnboardingRequest, TrainingCourse, TrainingEnrollment } from '../types/models'
import { isApiDataMode, apiRequest } from '../lib/apiClient'
import { apiEmployeeRepository } from './apiEmployeeRepository'
import { apiLeaveRepository, apiDepartmentRepository, apiHolidayRepository, apiOnboardingRepository, apiOffboardingRepository, apiDocumentRepository, apiTrainingCourseRepository, apiTrainingEnrollmentRepository, apiAttendanceActions, apiPerformanceActions, apiRecruitmentActions } from './apiDomainRepositories'
import type { AttendanceFilters, PerformanceActions, RecruitmentActions } from './apiDomainRepositories'
import type { AttendanceRecord } from '../types/models'
import { departments } from './mock'

export type RepositoryOperation = 'list' | 'get' | 'create' | 'update' | 'delete'

export interface RepositoryQuery<T> {
  page?: number
  pageSize?: number
  search?: string
  searchFields?: (keyof T)[]
  where?: Partial<Record<keyof T, unknown>>
  sortBy?: keyof T
  sortDirection?: 'asc' | 'desc'
  columnFilters?: Record<string, string | { from?: string; to?: string } | { operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }>
}

export interface RepositoryPage<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

 export interface MockRepository<T extends { id: string | number }> {
  list(query?: RepositoryQuery<T>): Promise<RepositoryPage<T>>
  get(id: T['id']): Promise<T | null>
  create(input: Omit<T, 'id'>): Promise<T>
  update(id: T['id'], updates: Partial<Omit<T, 'id'>>): Promise<T | null>
  delete(id: T['id']): Promise<boolean>
}

export interface MockRepositoryOptions {
  latencyMs?: number
  failNext?: Partial<Record<RepositoryOperation, string>>
}

export function createMockRepository<T extends { id: string | number }>(
  adapter: {
    read: () => T[]
    get: (id: T['id']) => T | null
    create: (input: Omit<T, 'id'>) => T
    update: (id: T['id'], updates: Partial<Omit<T, 'id'>>) => T | null
    delete: (id: T['id']) => boolean
  },
  options: MockRepositoryOptions = {},
): MockRepository<T> {
  const delay = options.latencyMs ?? 0
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError('Mock repository latency must be a non-negative number.')
  }
  const failures = { ...options.failNext }

  async function run<R>(operation: RepositoryOperation, action: () => R): Promise<R> {
    if (delay > 0) await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay))
    const failure = failures[operation]
    if (failure) {
      delete failures[operation]
      throw new Error(failure)
    }
    return action()
  }

  return {
    list(query = {}) {
      return run('list', () => {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 20
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1) {
          throw new RangeError('Page and page size must be positive integers.')
        }

        let records = adapter.read().filter((record) =>
          Object.entries(query.where ?? {}).every(([key, value]) =>
            value === undefined || Object.is(record[key as keyof T], value),
          ),
        )
        const search = query.search?.trim().toLocaleLowerCase()
        if (search) {
          const fields = query.searchFields ?? []
          records = records.filter((record) =>
            fields.some((field) => String(record[field] ?? '').toLocaleLowerCase().includes(search)),
          )
        }
        if (query.sortBy) {
          const direction = query.sortDirection === 'desc' ? -1 : 1
          const sortBy = query.sortBy
          records = records.toSorted((left, right) => {
            const a = left[sortBy]
            const b = right[sortBy]
            const result = typeof a === 'number' && typeof b === 'number'
              ? a - b
              : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true })
            return result * direction
          })
        }
        const total = records.length
        const start = (page - 1) * pageSize
        return { data: structuredClone(records.slice(start, start + pageSize)), page, pageSize, total }
      })
    },
    get(id) {
      return run('get', () => {
        const record = adapter.get(id)
        return record ? structuredClone(record) : null
      })
    },
    create(input) {
      return run('create', () => structuredClone(adapter.create(input)))
    },
    update(id, updates) {
      return run('update', () => {
        const record = adapter.update(id, updates)
        return record ? structuredClone(record) : null
      })
    },
    delete(id) {
      return run('delete', () => adapter.delete(id))
    },
  }
}

export const employeeRepository: MockRepository<Employee> = isApiDataMode
  ? apiEmployeeRepository
  : createMockRepository<Employee>({
      read: getEmployees,
      get: getEmployeeById,
      create: createEmployee,
      update: updateEmployee,
      delete: deleteEmployee,
    })

export const leaveRequestRepository = isApiDataMode
  ? apiLeaveRepository
  : createMockRepository<LeaveRequest>({
      read: getLeaveRequests,
      get: (id) => getLeaveRequests().find((request) => request.id === id) ?? null,
      create: createLeaveRequest,
      update: updateLeaveRequest,
      delete: deleteLeaveRequest,
    })
export const departmentRepository = isApiDataMode
  ? apiDepartmentRepository
  : createMockRepository<Department>({
      read: () => departments,
      get: (id) => departments.find((d) => d.id === id) ?? null,
      create: (input) => {
        const newDept: Department = { id: String(Date.now()), employeeCount: 0, color: '#3b82f6', head: '', ...input }
        departments.push(newDept)
        return newDept
      },
      update: (id, updates) => {
        const index = departments.findIndex((d) => d.id === id)
        if (index === -1) return null
        departments[index] = { ...departments[index], ...updates }
        return departments[index]
      },
      delete: (id) => {
        const index = departments.findIndex((d) => d.id === id)
        if (index === -1) return false
        departments.splice(index, 1)
        return true
      },
    })

export const holidayRepository = isApiDataMode
  ? apiHolidayRepository
  : createMockRepository<Holiday>({
      read: getHolidays,
      get: (id) => getHolidays().find((h) => h.id === id) ?? null,
      create: (input) => {
        const h: Holiday = { id: String(Date.now()), ...input }
        getHolidays().push(h)
        return h
      },
      update: (id, updates) => {
        const list = getHolidays()
        const index = list.findIndex((h) => h.id === id)
        if (index === -1) return null
        list[index] = { ...list[index], ...updates }
        return list[index]
      },
      delete: (id) => {
        const list = getHolidays()
        const index = list.findIndex((h) => h.id === id)
        if (index === -1) return false
        list.splice(index, 1)
        return true
      },
    })

export const onboardingRepository = isApiDataMode
  ? apiOnboardingRepository
  : createMockRepository<OnboardingRequest>({
      read: getOnboardingRequests,
      get: (id) => getOnboardingRequests().find((request) => request.id === id) ?? null,
      create: createOnboardingTask,
      update: updateOnboardingTask,
      delete: deleteOnboardingTask,
    })

export const offboardingRepository = isApiDataMode
  ? apiOffboardingRepository
  : createMockRepository<OffboardingRequest>({
      read: getOffboardingTasks,
      get: (id) => getOffboardingTasks().find((request) => request.id === id) ?? null,
      create: createOffboardingTask,
      update: updateOffboardingTask,
      delete: deleteOffboardingTask,
    })

export const trainingCourseRepository = isApiDataMode
  ? apiTrainingCourseRepository
  : createMockRepository<TrainingCourse>({
      read: () => [],
      get: () => null,
      create: (input) => ({ id: String(Date.now()), ...input }),
      update: (_id, _updates) => null,
      delete: () => true,
    })

export const recruitmentActions: RecruitmentActions = isApiDataMode
  ? apiRecruitmentActions
  : {
      listJobs: () => Promise.resolve([]),
      createJob: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      updateJob: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      deleteJob: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      listCandidates: () => Promise.resolve([]),
      createCandidate: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      updateCandidate: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      deleteCandidate: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      uploadCv: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      listApplications: () => Promise.resolve([]),
      createApplication: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      updateApplication: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      deleteApplication: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      listInterviews: () => Promise.resolve([]),
      createInterview: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      updateInterview: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
      deleteInterview: () => Promise.reject(new Error('Recruitment is not available in demo mode.')),
    }

export const performanceActions: PerformanceActions = isApiDataMode
  ? apiPerformanceActions
  : {
      listCycles: () => Promise.resolve([]),
      createCycle: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      updateCycle: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      deleteCycle: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      listReviews: () => Promise.resolve([]),
      createReview: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      updateReview: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      deleteReview: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      listGoals: () => Promise.resolve([]),
      createGoal: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      updateGoal: () => Promise.reject(new Error('Performance is not available in demo mode.')),
      deleteGoal: () => Promise.reject(new Error('Performance is not available in demo mode.')),
    }

export const trainingEnrollmentRepository = isApiDataMode
  ? apiTrainingEnrollmentRepository
  : createMockRepository<TrainingEnrollment>({
      read: () => [],
      get: () => null,
      create: (input) => ({ id: String(Date.now()), ...input }),
      update: (_id, _updates) => null,
      delete: () => true,
    })

export const attendanceActions = isApiDataMode
  ? apiAttendanceActions
  : {
      async list(_filters?: AttendanceFilters): Promise<AttendanceRecord[]> {
        return []
      },
      async save(input: {
        employeeId: number
        date: string
        checkIn?: string | null
        checkOut?: string | null
        status?: AttendanceRecord['status']
        notes?: string | null
      }): Promise<AttendanceRecord> {
        return {
          id: String(Date.now()),
          employee: '',
          checkIn: input.checkIn ?? null,
          checkOut: input.checkOut ?? null,
          status: input.status ?? 'present',
          hoursWorked: null,
          validated: false,
          validatedBy: null,
          notes: input.notes ?? '',
          source: 'record',
          leaveRequestId: null,
          employeeId: input.employeeId,
          date: input.date,
        }
      },
      async update(id: string, _input: unknown): Promise<AttendanceRecord> {
        throw new Error(`No attendance record ${id} in mock mode.`)
      },
      async validate(id: string): Promise<AttendanceRecord> {
        throw new Error(`No attendance record ${id} in mock mode.`)
      },
      async remove(): Promise<void> {},
    }

export const documentRepository = isApiDataMode
  ? apiDocumentRepository
  : createMockRepository<EmployeeDocumentRecord>({
      read: () => [],
      get: () => null,
      create: (input) => ({ id: String(Date.now()), ...input }),
      update: (_id, _updates) => null,
      delete: () => true,
    })


export function resetDemoRepositoryData(confirmed: boolean): Promise<void> {
  return Promise.resolve().then(() => resetStoredDemoData(confirmed))
}

export const dashboardRepository = isApiDataMode
  ? {
      async getStatistics() {
        const response = await apiRequest('/api/v1/dashboard/statistics')
        return response
      },
    }
  : {
      async getStatistics() {
        const employees = getEmployees()
        const onboardingRequests = getOnboardingRequests()
        const offboardingRequests = getOffboardingTasks()
        const leaveRequests = getLeaveRequests()
        const holidays = getHolidays()
        return {
          metrics: {
            totalEmployees: employees.length,
            activeEmployees: employees.filter((e) => e.status === 'Active').length,
            onLeaveCount: employees.filter((e) => e.status === 'On Leave').length,
            activeOnboarding: onboardingRequests.filter(
              (req) => req.status !== 'Completed' && req.stage !== 'Completed'
            ).length,
            onboardingAtRisk: onboardingRequests.filter((req) => req.status === 'At risk').length,
            activeOffboarding: offboardingRequests.filter((request) => request.status !== 'Completed').length,
            offboardingOverdue: offboardingRequests.filter((request) => request.status === 'Overdue').length,
            leavePending: leaveRequests.filter((req) => req.status === 'pending').length,
          },
          employees,
          onboardingRequests,
          offboardingRequests,
          leaveRequests,
          holidays,
        }
      },
    }
