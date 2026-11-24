import { apiRequest } from '../lib/apiClient'
import type { AnalyticsOverview } from './analyticsRepository'

export interface AnalyticsFilters {
  from?: string
  to?: string
  compareFrom?: string
  compareTo?: string
  departmentId?: string
  location?: string
  employmentStatus?: string
}

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RawRecord) : {}
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asNumberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, entry] of Object.entries(asRecord(value))) out[key] = asNumber(entry)
  return out
}

function distributionRows(value: unknown): Array<{ label: string; value: number }> {
  return asArray(value).map((row) => {
    const r = asRecord(row)
    return { label: asString(r.label), value: asNumber(r.value) }
  })
}

function namedRows(value: unknown): Array<{ name: string; total: number }> {
  return asArray(value).map((row) => {
    const r = asRecord(row)
    return { name: asString(r.name), total: asNumber(r.total) }
  })
}

/**
 * Normalize the raw /api/v1/analytics/overview payload into a complete
 * AnalyticsOverview.
 *
 * The backend only returns the sections it computes (period, scope,
 * workforce, leave, onboarding, offboarding, workflow, limitations). The
 * Reports page also expects hires, tenure, gender, lifecycle and
 * operations — a raw payload therefore crashed the page the moment data
 * arrived (e.g. `data.hires.internalVsExternal` on `undefined`), which
 * unmounted the whole app because there is no error boundary. Normalizing
 * here keeps every consumer safe: real values where the API provides them,
 * honest empty defaults elsewhere, and a limitations entry explaining
 * which breakdowns are missing.
 */
export function normalizeAnalyticsOverview(raw: unknown): AnalyticsOverview {
  const root = asRecord(raw)
  const period = asRecord(root.period)
  const scope = asRecord(root.scope)
  const workforce = asRecord(root.workforce)
  const leave = asRecord(root.leave)
  const onboarding = asRecord(root.onboarding)
  const offboarding = asRecord(root.offboarding)
  const workflow = asRecord(root.workflow)
  const rawHires = asRecord(root.hires)
  const rawTenure = asRecord(root.tenure)
  const rawGender = asRecord(root.gender)
  const rawLifecycle = asRecord(root.lifecycle)
  const rawOperations = asRecord(root.operations)

  const limitations: Record<string, string> = {}
  for (const [key, entry] of Object.entries(asRecord(root.limitations))) {
    if (typeof entry === 'string') limitations[key] = entry
  }
  if (root.hires === undefined && !limitations.hires) {
    limitations.hires = 'Hire history and hire-source breakdowns are not included in the analytics response yet.'
  }
  if (root.tenure === undefined && !limitations.tenure) {
    limitations.tenure = 'Tenure breakdowns are not included in the analytics response yet.'
  }
  if (root.gender === undefined && !limitations.gender) {
    limitations.gender = 'Gender breakdowns are not included in the analytics response yet.'
  }
  if (root.operations === undefined && !limitations.documents) {
    limitations.documents = 'Document totals are not included in the analytics response yet.'
  }

  const offboardingByStatus = asNumberRecord(offboarding.byStatus)
  const offboardingTotal = Object.values(offboardingByStatus).reduce((sum, n) => sum + n, 0)
  const offboardingCompleted = asNumber(offboarding.completed)
  const workflowByStatus = asNumberRecord(workflow.byStatus)
  const workflowTotal = Object.values(workflowByStatus).reduce((sum, n) => sum + n, 0)

  const lifecycleOnboarding = asRecord(rawLifecycle.onboarding)
  const lifecycleOffboarding = asRecord(rawLifecycle.offboarding)
  const lifecycleRetention = asRecord(rawLifecycle.retention)
  const operationsDocuments = asRecord(rawOperations.documents)
  const operationsCompliance = asRecord(rawOperations.compliance)
  const operationsAutomation = asRecord(rawOperations.automation)

  return {
    period: {
      from: asString(period.from),
      to: asString(period.to),
      timezone: asString(period.timezone),
    },
    scope: { employeeCount: asNumber(scope.employeeCount) },
    workforce: {
      headcount: asNumber(workforce.headcount),
      active: asNumber(workforce.active),
      onLeave: asNumber(workforce.onLeave),
      newHires: asNumber(workforce.newHires),
      departures: asNullableNumber(workforce.departures),
      departmentDistribution: namedRows(workforce.departmentDistribution),
      statusDistribution: asArray(workforce.statusDistribution).map((row) => {
        const r = asRecord(row)
        return { status: asString(r.status), total: asNumber(r.total) }
      }),
      headcountTrend: asArray(workforce.headcountTrend).map((row) => {
        const r = asRecord(row)
        return { month: asString(r.month), total: asNumber(r.total) }
      }),
    },
    leave: {
      byStatus: asNumberRecord(leave.byStatus),
      byType: asNumberRecord(leave.byType),
      monthlyTrend: asArray(leave.monthlyTrend).map((row) => {
        const r = asRecord(row)
        return { month: asString(r.month), days: asNumber(r.days), requests: asNumber(r.requests) }
      }),
      approvedDays: asNumber(leave.approvedDays),
      absenceRate: asNullableNumber(leave.absenceRate),
      upcomingAbsences: asNumber(leave.upcomingAbsences),
    },
    onboarding: {
      byStatus: asNumberRecord(onboarding.byStatus),
      active: asNumber(onboarding.active),
      completed: asNumber(onboarding.completed),
      completionRate: asNullableNumber(onboarding.completionRate),
      overdueTasks: asNumber(onboarding.overdueTasks),
    },
    offboarding: {
      byStatus: offboardingByStatus,
      completed: offboardingCompleted,
      completionRate: asNullableNumber(offboarding.completionRate),
      reasons: asArray(offboarding.reasons).map((row) => {
        const r = asRecord(row)
        return { reason: asString(r.reason), total: asNumber(r.total) }
      }),
      handoverProgress: asNullableNumber(offboarding.handoverProgress),
    },
    workflow: {
      byStatus: workflowByStatus,
      approvalRate: asNullableNumber(workflow.approvalRate),
      rejectionRate: asNullableNumber(workflow.rejectionRate),
      averageCompletionHours: asNullableNumber(workflow.averageCompletionHours),
      overdueSteps: asNullableNumber(workflow.overdueSteps),
    },
    tenure: {
      distribution: distributionRows(rawTenure.distribution),
      averageMonths: asNullableNumber(rawTenure.averageMonths),
    },
    gender: {
      distribution: distributionRows(rawGender.distribution),
      diversityIndex: asNullableNumber(rawGender.diversityIndex),
    },
    hires: {
      cumulative: asArray(rawHires.cumulative).map((row) => {
        const r = asRecord(row)
        return { year: asString(r.year), total: asNumber(r.total) }
      }),
      annual: asArray(rawHires.annual).map((row) => {
        const r = asRecord(row)
        return { year: asString(r.year), total: asNumber(r.total) }
      }),
      internalVsExternal: {
        internal: asNumber(asRecord(rawHires.internalVsExternal).internal),
        external: asNumber(asRecord(rawHires.internalVsExternal).external),
      },
    },
    lifecycle: {
      onboarding: {
        active: asNumber(lifecycleOnboarding.active ?? onboarding.active),
        completed: asNumber(lifecycleOnboarding.completed ?? onboarding.completed),
        avgDays: asNullableNumber(lifecycleOnboarding.avgDays),
      },
      offboarding: {
        active: asNumber(lifecycleOffboarding.active ?? Math.max(0, offboardingTotal - offboardingCompleted)),
        completed: asNumber(lifecycleOffboarding.completed ?? offboardingCompleted),
        avgDays: asNullableNumber(lifecycleOffboarding.avgDays),
      },
      retention: {
        rate: asNullableNumber(lifecycleRetention.rate),
        turnover: asNullableNumber(lifecycleRetention.turnover),
      },
    },
    operations: {
      documents: {
        pending: asNumber(operationsDocuments.pending),
        expired: asNumber(operationsDocuments.expired),
        total: asNumber(operationsDocuments.total),
      },
      compliance: { rate: asNullableNumber(operationsCompliance.rate) },
      automation: {
        workflows: asNumber(operationsAutomation.workflows ?? workflowTotal),
        automationRate: asNullableNumber(operationsAutomation.automationRate),
      },
    },
    limitations,
  }
}

export async function getAnalyticsOverview(filters: AnalyticsFilters = {}): Promise<AnalyticsOverview> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const raw = await apiRequest<unknown>(`/api/v1/analytics/overview?${params.toString()}`)
  return normalizeAnalyticsOverview(raw)
}
