export interface AnalyticsOverview {
  period: { from: string; to: string; timezone: string }
  scope: { employeeCount: number }
  workforce: {
    headcount: number
    active: number
    onLeave: number
    newHires: number
    departures: number | null
    departmentDistribution: Array<{ name: string; total: number }>
    statusDistribution: Array<{ status: string; total: number }>
    headcountTrend: Array<{ month: string; total: number }>
  }
  leave: {
    byStatus: Record<string, number>
    byType: Record<string, number>
    monthlyTrend: Array<{ month: string; days: number; requests: number }>
    approvedDays: number
    absenceRate: number | null
    upcomingAbsences: number
  }
  onboarding: {
    byStatus: Record<string, number>
    active: number
    completed: number
    completionRate: number | null
    overdueTasks: number
  }
  offboarding: {
    byStatus: Record<string, number>
    completed: number
    completionRate: number | null
    reasons: Array<{ reason: string; total: number }>
    handoverProgress: number | null
  }
  workflow: {
    byStatus: Record<string, number>
    approvalRate: number | null
    rejectionRate: number | null
    averageCompletionHours: number | null
    overdueSteps: number | null
  }
  tenure: {
    distribution: Array<{ label: string; value: number }>
    averageMonths: number | null
  }
  gender: {
    distribution: Array<{ label: string; value: number }>
    diversityIndex: number | null
  }
  hires: {
    cumulative: Array<{ year: string; total: number }>
    annual: Array<{ year: string; total: number }>
    internalVsExternal: { internal: number; external: number }
  }
  lifecycle: {
    onboarding: { active: number; completed: number; avgDays: number | null }
    offboarding: { active: number; completed: number; avgDays: number | null }
    retention: { rate: number | null; turnover: number | null }
  }
  operations: {
    documents: { pending: number; expired: number; total: number }
    compliance: { rate: number | null }
    automation: { workflows: number; automationRate: number | null }
  }
  limitations: Record<string, string>
}
