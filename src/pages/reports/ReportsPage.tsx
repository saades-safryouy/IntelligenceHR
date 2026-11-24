import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, BriefcaseBusiness,
  CalendarDays, CheckCircle2, Clock3, FileWarning, RefreshCw, Users,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { PageHeader } from '../../components/common/PageHeader'
import { getAnalyticsOverview } from '../../data/analyticsApi'
import type { AnalyticsOverview } from '../../data/analyticsRepository'
import { isApiDataMode } from '../../lib/apiClient'
import './ReportsPage.css'

type Tab = 'workforce' | 'cumulative' | 'annual' | 'tenure' | 'gender' | 'internal' | 'leave' | 'lifecycle' | 'operations'
const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'workforce', label: 'Workforce' }, { key: 'cumulative', label: 'Cumulative hires' },
  { key: 'annual', label: 'Annual hires' }, { key: 'tenure', label: 'Tenure' },
  { key: 'gender', label: 'Gender diversity' }, { key: 'internal', label: 'Hire source' },
  { key: 'leave', label: 'Leave' }, { key: 'lifecycle', label: 'Lifecycle' },
  { key: 'operations', label: 'Operations' },
]
const chartColors = ['#7891aa', '#9eafa9', '#a8b2bc', '#c0c7ce', '#d0d5da']
const axisStyle = { fill: 'var(--muted)', fontSize: 11 }
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }

function Metric({ label, value, note, icon, accent = 'blue' }: { label: string; value: string; note: string; icon: React.ReactNode; accent?: string }) {
  return <article className={`reports-metric reports-metric-${accent}`}>
    <div className="reports-metric-top"><span>{label}</span><i>{icon}</i></div>
    <strong>{value}</strong><small>{note}</small>
  </article>
}

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <section className={`reports-panel ${className}`}><header className="reports-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></header>{children}</section>
}

function EmptyChart({ message = 'No records available for this period.' }: { message?: string }) {
  return <div className="reports-empty-chart"><Activity size={20} /><span>{message}</span></div>
}

function ChartFrame({ children, height = 280 }: { children: React.ReactNode; height?: number }) {
  return <div className="reports-chart" style={{ height }} dir="ltr">{children}</div>
}

function Distribution({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return <Panel title={title} subtitle="Employee count by category"><DistributionBars rows={rows} /></Panel>
}

/**
 * Catches render errors in the report content (e.g. a malformed payload)
 * and shows a visible error card with Retry instead of unmounting the
 * whole app into a blank page.
 */
class ReportsErrorBoundary extends Component<{ children: React.ReactNode; onRetry: () => void }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' }

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : 'The report could not be rendered.' }
  }

  render() {
    if (this.state.failed) {
      return <div className="reports-error-card" role="alert"><AlertCircle size={19} /><div><strong>We couldn’t render these reports</strong><p>{this.state.message}</p></div><button type="button" onClick={() => { this.setState({ failed: false, message: '' }); this.props.onRetry() }}>Try again</button></div>
    }
    return this.props.children
  }
}

function formatMonth(value: string) {
  if (typeof value !== 'string') return String(value ?? '')
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(new Date(year, month - 1, 1))
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('workforce')
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  const load = useCallback(async (signal: { active: boolean }) => {
    try {
      const result = await getAnalyticsOverview({ from, to })
      if (signal.active) setData(result)
    } catch (cause: unknown) {
      if (signal.active) setError(cause instanceof Error ? cause.message : 'Reports could not be loaded.')
    } finally {
      if (signal.active) setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    if (!isApiDataMode) return
    const signal = { active: true }
    void load(signal)
    return () => { signal.active = false }
  }, [load, reload])

  const statusRows = useMemo(() => data?.workforce.statusDistribution?.map(row => ({ label: row.status, value: Number(row.total) })) ?? [], [data])
  const departmentRows = useMemo(() => data?.workforce.departmentDistribution?.map(row => ({ label: row.name, value: Number(row.total) })) ?? [], [data])
  const leaveStatusRows = useMemo(() => Object.entries(data?.leave.byStatus ?? {}).map(([label, value]) => ({ label, value: Number(value) })), [data])
  const hireSourceRows = useMemo(() => data?.hires?.internalVsExternal ? [{ label: 'Internal', value: data.hires.internalVsExternal.internal }, { label: 'External', value: data.hires.internalVsExternal.external }] : [], [data])
  const dateInvalid = Boolean(from && to && from > to)

  if (!isApiDataMode) return <div className="reports-page"><PageHeader eyebrow="REPORTS" title="HR reports" subtitle="Reports require the connected API." /></div>

  const currentTab = tabs.find(item => item.key === tab)
  const subtitle = currentTab ? `${currentTab.label} · ${from} to ${to}` : ''

  return <div className="reports-page">
    <PageHeader eyebrow="PEOPLE ANALYTICS" title="HR reports" subtitle="A clear view of workforce health, movement and operations." />

    <section className="reports-toolbar" aria-label="Report filters">
      <div className="reports-toolbar-copy"><span className="reports-eyebrow">REPORT PERIOD</span><strong>Choose a date range</strong><small>Metrics are limited to employees you are authorized to view.</small></div>
      <div className="reports-date-filter">
        <label>From<input type="date" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setLoading(true); setError('') }} /></label>
        <span className="reports-date-separator" aria-hidden="true">—</span>
        <label>To<input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setLoading(true); setError('') }} /></label>
      </div>
      <div className="reports-scope"><Users size={15} /><strong>{data?.scope.employeeCount ?? '—'}</strong><span>in scope</span></div>
      <button className="reports-refresh" type="button" onClick={() => { setLoading(true); setError(''); setReload(value => value + 1) }} disabled={loading || dateInvalid} aria-label="Refresh reports"><RefreshCw size={15} className={loading ? 'reports-spinning' : ''} /><span>Refresh</span></button>
    </section>

    {dateInvalid && <div className="reports-inline-error" role="alert">The start date must be before the end date.</div>}

    <nav className="reports-tabs" aria-label="Report categories" role="tablist">
      {tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}
    </nav>

    <div className="reports-content-heading"><div><span className="reports-eyebrow">REPORT OVERVIEW</span><h2>{currentTab?.label}</h2><p>{subtitle}</p></div>{data && <span className="reports-updated"><CheckCircle2 size={14} /> Live data</span>}</div>

    {loading && <div className="reports-state" role="status"><span className="reports-loader" />Loading report data…</div>}
    {!loading && error && <div className="reports-error-card" role="alert"><AlertCircle size={19} /><div><strong>We couldn’t load these reports</strong><p>{error}</p></div><button type="button" onClick={() => setReload(value => value + 1)}>Try again</button></div>}
    {!loading && !error && !data && <div className="reports-state">Reports are unavailable.</div>}

    {!loading && !error && data && <ReportsErrorBoundary key={tab} onRetry={() => { setLoading(true); setError(''); setReload(value => value + 1) }}>
      {tab === 'workforce' && <>
        <div className="reports-kpi-grid">
          <Metric label="Total headcount" value={String(data.workforce.headcount)} note={`${data.workforce.active} active employees`} icon={<Users size={18} />} />
          <Metric label="New hires" value={String(data.workforce.newHires)} note="Joined in selected period" icon={<ArrowUpRight size={18} />} accent="mint" />
          <Metric label="Departures" value={data.workforce.departures === null ? '—' : String(data.workforce.departures)} note="Recorded in selected period" icon={<ArrowDownRight size={18} />} accent="orange" />
          <Metric label="On leave" value={String(data.workforce.onLeave)} note="Current employee status" icon={<CalendarDays size={18} />} accent="violet" />
        </div>
        <div className="reports-grid reports-grid-wide">
          <Panel title="Headcount over time" subtitle="Employee count at the end of each month" className="reports-panel-span-2">
            {data.workforce.headcountTrend.length ? <ChartFrame height={310}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.workforce.headcountTrend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <defs><linearGradient id="reports-headcount-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7891aa" stopOpacity={0.18} /><stop offset="95%" stopColor="#7891aa" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="month" tickFormatter={formatMonth} tick={axisStyle} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatMonth} /><Area type="linear" dataKey="total" name="Employees" stroke="#7891aa" strokeWidth={2} fill="url(#reports-headcount-fill)" activeDot={{ r: 4 }} />
            </AreaChart></ResponsiveContainer></ChartFrame> : <EmptyChart />}
          </Panel>
          <Panel title="Employees by department" subtitle="Current distribution"><DistributionBars rows={departmentRows} /></Panel>
          <Distribution title="Employment status" rows={statusRows} />
        </div>
      </>}

      {tab === 'cumulative' && <div className="reports-grid"><Panel title="Cumulative hires by year" subtitle="Recorded employee start dates, all available history" className="reports-panel-span-2"><YearChart rows={data.hires.cumulative} cumulative /></Panel></div>}
      {tab === 'annual' && <div className="reports-grid"><Panel title="Annual hires" subtitle="Hires grouped by year within the selected reporting period" className="reports-panel-span-2"><YearChart rows={data.hires.annual} /></Panel></div>}

      {tab === 'tenure' && <div className="reports-grid"><Panel title="Tenure distribution" subtitle="Active employees grouped by length of service"><DistributionBars rows={data.tenure.distribution} /></Panel><Panel title="Average tenure" subtitle="Time since recorded start date"><div className="reports-feature-metric"><Clock3 size={21} /><strong>{data.tenure.averageMonths === null ? '—' : `${data.tenure.averageMonths}`}</strong><span>months</span><small>{data.tenure.averageMonths === null ? 'Not enough data to calculate.' : `${(data.tenure.averageMonths / 12).toFixed(1)} years on average`}</small></div></Panel></div>}

      {tab === 'gender' && <div className="reports-grid"><Distribution title="Gender distribution" rows={data.gender.distribution} /><Panel title="Representation indicator" subtitle="Simpson diversity index"><div className="reports-feature-metric"><Activity size={21} /><strong>{data.gender.diversityIndex === null ? '—' : data.gender.diversityIndex.toFixed(3)}</strong><span>index</span><small>Higher values indicate a more evenly distributed representation. This is a descriptive statistic, not a target.</small></div></Panel></div>}

      {tab === 'internal' && <div className="reports-grid"><Distribution title="Hire source breakdown" rows={hireSourceRows} /><Panel title="Hire source totals" subtitle="Hires in the selected reporting period"><StatRow label="Internal hires" value={data.hires.internalVsExternal.internal} /><StatRow label="External hires" value={data.hires.internalVsExternal.external} /><StatRow label="Total classified hires" value={data.hires.internalVsExternal.internal + data.hires.internalVsExternal.external} /><p className="reports-note">Classification follows the employee’s recorded hire source. Review employee records where a source has not been assigned.</p></Panel></div>}

      {tab === 'leave' && <div className="reports-grid"><Panel title="Leave requests by month" subtitle="Approved leave days and request volume" className="reports-panel-span-2">{data.leave.monthlyTrend.length ? <ChartFrame height={300}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.leave.monthlyTrend} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="month" tickFormatter={formatMonth} tick={axisStyle} axisLine={false} tickLine={false} /><YAxis yAxisId="days" allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} /><YAxis yAxisId="requests" orientation="right" allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatMonth} /><Legend /><Bar yAxisId="days" dataKey="days" name="Approved days" fill="#7891aa" radius={[3, 3, 0, 0]} /><Bar yAxisId="requests" dataKey="requests" name="Requests" fill="#a8b2bc" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame> : <EmptyChart />}</Panel><Distribution title="Requests by status" rows={leaveStatusRows} /><Panel title="Leave indicators" subtitle="Selected reporting period"><StatRow label="Approved leave days" value={data.leave.approvedDays} /><StatRow label="Absence rate" value={data.leave.absenceRate === null ? '—' : `${data.leave.absenceRate}%`} /><StatRow label="Upcoming absences" value={data.leave.upcomingAbsences} /></Panel></div>}

      {tab === 'lifecycle' && <div className="reports-grid"><Panel title="Onboarding" subtitle="New employee experience"><StatRow label="Active cases" value={data.lifecycle.onboarding.active} /><StatRow label="Completed cases" value={data.lifecycle.onboarding.completed} /><StatRow label="Average duration" value={data.lifecycle.onboarding.avgDays === null ? '—' : `${data.lifecycle.onboarding.avgDays} days`} /></Panel><Panel title="Offboarding" subtitle="Employee exit process"><StatRow label="Active cases" value={data.lifecycle.offboarding.active} /><StatRow label="Completed cases" value={data.lifecycle.offboarding.completed} /><StatRow label="Average duration" value={data.lifecycle.offboarding.avgDays === null ? '—' : `${data.lifecycle.offboarding.avgDays} days`} /></Panel><Panel title="Retention & turnover" subtitle="Based on employee records in scope"><div className="reports-rate-pair"><div><span>Retention</span><strong>{data.lifecycle.retention.rate === null ? '—' : `${data.lifecycle.retention.rate}%`}</strong></div><div><span>Turnover</span><strong>{data.lifecycle.retention.turnover === null ? '—' : `${data.lifecycle.retention.turnover}%`}</strong></div></div>{data.offboarding.reasons.length > 0 && <div className="reports-reasons"><h3>Recorded exit reasons</h3>{data.offboarding.reasons.slice(0, 5).map(row => <div className="reports-reason-item" key={row.reason}><span>{row.reason}</span><strong>{row.total}</strong></div>)}</div>}</Panel></div>}

      {tab === 'operations' && <div className="reports-grid"><Panel title="Document operations" subtitle="Employee document review and expiry"><StatRow label="Total documents" value={data.operations.documents.total} /><StatRow label="Pending review" value={data.operations.documents.pending} /><StatRow label="Expired documents" value={data.operations.documents.expired} /><div className="reports-compliance"><div><span>Document compliance</span><strong>{data.operations.compliance.rate === null ? '—' : `${data.operations.compliance.rate}%`}</strong></div>{data.operations.compliance.rate !== null && <div className="reports-compliance-track"><i style={{ width: `${Math.max(0, Math.min(100, data.operations.compliance.rate))}%` }} /></div>}</div></Panel><Panel title="Workflow activity" subtitle="Workflow records in the selected period"><div className="reports-feature-metric"><BriefcaseBusiness size={21} /><strong>{data.operations.automation.workflows}</strong><span>workflows</span><small>{data.operations.automation.automationRate === null ? (data.operations.automation.workflows > 0 ? 'Automation rate is not tracked for these workflows.' : 'No workflow records in this period.') : `${data.operations.automation.automationRate}% recorded automation rate`}</small></div><div className="reports-divider" /><StatRow label="Overdue workflow steps" value={data.workflow.overdueSteps ?? '—'} /><StatRow label="Average completion time" value={data.workflow.averageCompletionHours === null ? '—' : `${data.workflow.averageCompletionHours} hrs`} /></Panel></div>}

      {Object.keys(data.limitations ?? {}).length > 0 && <div className="reports-limitations"><FileWarning size={16} /><div>{Object.values(data.limitations ?? {}).map(message => <p key={message}>{message}</p>)}</div></div>}
    </ReportsErrorBoundary>}
  </div>
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return <div className="reports-stat-row"><span>{label}</span><strong>{value}</strong></div>
}

function DistributionBars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  if (!rows?.length) return <EmptyChart />
  const max = Math.max(1, ...rows.map(row => row.value))
  return <div className="reports-bars-list">{rows.map((row, index) => <div className="reports-bar-row" key={row.label}><div className="reports-bar-label"><span>{row.label}</span><strong>{row.value}</strong></div><div className="reports-bar-track"><i style={{ width: `${Math.round(row.value / max * 100)}%`, background: chartColors[index % chartColors.length] }} /></div></div>)}</div>
}

function YearChart({ rows, cumulative = false }: { rows: Array<{ year: string; total: number }>; cumulative?: boolean }) {
  if (!rows?.length) return <EmptyChart message="No hire records were found for this period." />
  return <ChartFrame height={320}><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="year" tick={axisStyle} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="total" name={cumulative ? 'Cumulative hires' : 'Hires'} fill="#7891aa" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame>
}
