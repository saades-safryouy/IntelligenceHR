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

export async function getAnalyticsOverview(filters: AnalyticsFilters = {}): Promise<AnalyticsOverview> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return apiRequest<AnalyticsOverview>(`/api/v1/analytics/overview?${params.toString()}`)
}
