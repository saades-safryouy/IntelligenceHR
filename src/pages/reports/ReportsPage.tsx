import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, FileWarning, UserCheck, UserRound, Users } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { getAnalyticsOverview } from '../../data/analyticsApi'
import type { AnalyticsOverview } from '../../data/analyticsRepository'
import { isApiDataMode } from '../../lib/apiClient'
import './ReportsPage.css'

type Tab = 'workforce' | 'cumulative' | 'annual' | 'tenure' | 'gender' | 'internal' | 'leave' | 'lifecycle' | 'operations'
const tabs: Array<[Tab, string]> = [['workforce', 'Workforce'], ['cumulative', 'Cumulative hires'], ['annual', 'Annual hires'], ['tenure', 'Tenure'], ['gender', 'Gender diversity'], ['internal', 'Internal vs external'], ['leave', 'Leave'], ['lifecycle', 'Lifecycle'], ['operations', 'Operations']]

function Metric({ label, value, note, icon }: { label: string; value: string; note: string; icon: React.ReactNode }) {
  return <article className="reports-kpi"><span className="reports-kpi-icon">{icon}</span><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
}
function Distribution({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <section className="reports-panel"><h2>{title}</h2>{rows.length ? rows.map((row) => <div className="reports-distribution-row" key={row.label}><div><span>{row.label}</span><strong>{row.value}</strong></div><div className="reports-bar"><span style={{ width: `${Math.round(row.value / max * 100)}%` }} /></div></div>) : <p className="reports-empty">No records are available.</p>}</section>
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('workforce')
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    setLoading(true)
    getAnalyticsOverview({ from, to }).then((result) => { if (active) setData(result) }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Reports could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [from, to])
  const status = useMemo(() => data?.workforce.statusDistribution.map((row) => ({ label: row.status, value: Number(row.total) })) ?? [], [data])
  const departments = useMemo(() => data?.workforce.departmentDistribution.map((row) => ({ label: row.name, value: Number(row.total) })) ?? [], [data])
  const leave = useMemo(() => Object.entries(data?.leave.byStatus ?? {}).map(([label, value]) => ({ label, value: Number(value) })), [data])
  if (!isApiDataMode) return <div className="reports-page"><PageHeader eyebrow="REPORTS" title="HR reports" subtitle="Reports require the connected API." /></div>
  if (loading) return <div className="reports-page"><PageHeader eyebrow="REPORTS" title="HR reports" subtitle="Loading analytics…" /><div className="reports-state">Loading reports…</div></div>
  if (error || !data) return <div className="reports-page"><PageHeader eyebrow="REPORTS" title="HR reports" subtitle="Permission-scoped analytics." /><div className="reports-state error">{error || 'Reports unavailable.'}</div></div>
  return (
    <div className="reports-page">
      <PageHeader eyebrow="REPORTS CENTER" title="HR analytics reports" subtitle="Real, permission-scoped HR reporting." />
      <div className="reports-toolbar"><div className="reports-date-filter"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><span>{data.scope.employeeCount} authorized records</span></div>
      <nav className="reports-tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <div className="reports-kpi-grid"><Metric label="Headcount" value={String(data.workforce.headcount)} note={`${data.workforce.active} active`} icon={<Users size={18} />} /><Metric label="New hires" value={String(data.workforce.newHires)} note="Selected period" icon={<UserCheck size={18} />} /><Metric label="Approved leave" value={String(data.leave.approvedDays)} note={`${data.leave.upcomingAbsences} upcoming`} icon={<CalendarDays size={18} />} /><Metric label="Onboarding active" value={String(data.onboarding.active)} note={`${data.onboarding.overdueTasks} overdue`} icon={<UserRound size={18} />} /></div>
      {tab === 'workforce' && <div className="reports-grid"><Distribution title="Department headcount" rows={departments} /><Distribution title="Employment status" rows={status} /></div>}
      {tab === 'leave' && <Distribution title="Leave by status" rows={leave} />}
      {(tab === 'cumulative' || tab === 'annual') && <section className="reports-panel"><h2>{tab === 'cumulative' ? 'Cumulative hires' : 'Annual hires'}</h2><p>Hires use valid employees.joined_at records. Historical snapshots are unavailable.</p><div className="reports-highlight"><strong>{data.workforce.newHires}</strong><span>Recorded hires</span></div></section>}
      {tab === 'internal' && <section className="reports-panel"><h2>Internal vs external hires</h2><div className="reports-unavailable"><FileWarning size={20} /><span>Unavailable: no authoritative hiring-source classification is stored.</span></div></section>}
      {(tab === 'tenure' || tab === 'gender') && <section className="reports-panel"><h2>{tab === 'tenure' ? 'Employee tenure' : 'Gender diversity'}</h2><div className="reports-unavailable"><FileWarning size={20} /><span>This metric requires the next backend aggregate extension. No unsupported values are fabricated.</span></div></section>}
    </div>
  )
}

