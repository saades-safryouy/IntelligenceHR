import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CalendarDays, CheckCircle2, Clock3, UsersRound } from 'lucide-react'
import { getAnalyticsOverview } from '../../data/analyticsApi'
import type { AnalyticsOverview } from '../../data/analyticsRepository'
import { isApiDataMode } from '../../lib/apiClient'
import './ProfessionalAnalytics.css'

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return (
    <article className="professional-analytics-kpi">
      <span className="professional-analytics-icon">{icon}</span>
      <span className="professional-analytics-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function Distribution({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <section className="professional-analytics-panel">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="professional-analytics-empty">No records in this period.</p> : rows.map((row) => (
        <div className="professional-analytics-row" key={row.label}>
          <div><span>{row.label}</span><strong>{row.value}</strong></div>
          <div className="professional-analytics-track"><span style={{ width: `${Math.round((row.value / max) * 100)}%` }} /></div>
        </div>
      ))}
    </section>
  )
}

export function ProfessionalAnalytics({ mode = 'organization' }: { mode?: 'organization' | 'manager' }) {
  const now = useMemo(() => new Date(), [])
  const [from, setFrom] = useState(() => `${now.getFullYear()}-01-01`)
  const [to, setTo] = useState(() => dateValue(now))
  const [compareFrom, setCompareFrom] = useState('')
  const [compareTo, setCompareTo] = useState('')
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    setLoading(true)
    setError('')
    getAnalyticsOverview({ from, to, compareFrom: compareFrom || undefined, compareTo: compareTo || undefined })
      .then((result) => { if (active) setData(result) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Analytics could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [from, to, compareFrom, compareTo])

  if (!isApiDataMode) return null
  if (loading) return <section className="professional-analytics-shell"><div className="professional-analytics-state">Loading analytics…</div></section>
  if (error) return <section className="professional-analytics-shell"><div className="professional-analytics-state error">{error}</div></section>
  if (!data) return null

  const unsupported = Object.values(data.limitations)
  const statusRows = data.workforce.statusDistribution.map((row) => ({ label: row.status, value: Number(row.total) }))
  const departmentRows = data.workforce.departmentDistribution.map((row) => ({ label: row.name, value: Number(row.total) }))
  const leaveRows = Object.entries(data.leave.byStatus).map(([label, value]) => ({ label, value: Number(value) }))
  const workflowRows = Object.entries(data.workflow.byStatus).map(([label, value]) => ({ label: label.replaceAll('_', ' '), value: Number(value) }))

  return (
    <section className="professional-analytics-shell" aria-label="HR analytics">
      <div className="professional-analytics-header">
        <div><span className="professional-analytics-eyebrow">{mode === 'manager' ? 'MANAGER ANALYTICS' : 'HR ANALYTICS'}</span><h2>{mode === 'manager' ? 'Team intelligence' : 'Workforce intelligence'}</h2><p>Server-aggregated metrics for the authorized reporting scope.</p></div>
        <div className="professional-analytics-filters">
          <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>Compare from<input type="date" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)} /></label>
          <label>Compare to<input type="date" value={compareTo} onChange={(event) => setCompareTo(event.target.value)} /></label>
        </div>
      </div>

      <div className="professional-analytics-kpis">
        <Metric label="Headcount" value={String(data.workforce.headcount)} note={`${data.scope.employeeCount} authorized records`} icon={<UsersRound size={18} />} />
        <Metric label="Active workforce" value={String(data.workforce.active)} note={`${data.workforce.newHires} new hires in period`} icon={<CheckCircle2 size={18} />} />
        <Metric label="Approved leave days" value={String(data.leave.approvedDays)} note={`${data.leave.upcomingAbsences} upcoming absences`} icon={<CalendarDays size={18} />} />
        <Metric label="Workflow completion" value={data.workflow.averageCompletionHours == null ? '—' : `${Math.round(data.workflow.averageCompletionHours)}h`} note="Average completed workflow time" icon={<Clock3 size={18} />} />
      </div>

      <div className="professional-analytics-grid">
        <Distribution title="Department distribution" rows={departmentRows} />
        <Distribution title="Employment status" rows={statusRows} />
        <Distribution title="Leave requests by status" rows={leaveRows} />
        <Distribution title="Workflow status" rows={workflowRows} />
      </div>

      <div className="professional-analytics-lifecycle">
        <div><BarChart3 size={16} /><strong>Lifecycle overview</strong></div>
        <span>Onboarding active: <b>{data.onboarding.active}</b></span>
        <span>Onboarding overdue tasks: <b>{data.onboarding.overdueTasks}</b></span>
        <span>Offboarding completed: <b>{data.offboarding.completed}</b></span>
        <span>Handover progress: <b>{data.offboarding.handoverProgress == null ? '—' : `${Math.round(data.offboarding.handoverProgress)}%`}</b></span>
      </div>

      {unsupported.length > 0 && <details className="professional-analytics-limitations"><summary>Data limitations</summary><ul>{unsupported.map((item) => <li key={item}>{item}</li>)}</ul></details>}
    </section>
  )
}
