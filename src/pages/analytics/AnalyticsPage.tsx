import { ProfessionalAnalytics } from '../../components/dashboard/ProfessionalAnalytics'
import { PageHeader } from '../../components/common/PageHeader'

export function AnalyticsPage({ mode = 'organization' }: { mode?: 'organization' | 'manager' }) {
  return (
    <div className="page analytics-page">
      <PageHeader
        eyebrow={mode === 'manager' ? 'MANAGER PORTAL' : 'HR ADMIN'}
        title={mode === 'manager' ? 'Team analytics' : 'HR analytics'}
        subtitle="Explore permission-scoped workforce, lifecycle, leave, and workflow performance metrics."
      />
      <ProfessionalAnalytics mode={mode} />
    </div>
  )
}
