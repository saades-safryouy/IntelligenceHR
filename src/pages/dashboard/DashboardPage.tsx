import { useState, useMemo, useEffect } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Event } from '../../components/dashboard/Event'
import { Activity } from '../../components/dashboard/Activity'
import { PanelTitle } from '../../components/common/PanelTitle'
import { KpiStrip } from '../../components/dashboard/KpiStrip'
import {
  generateExportCsv,
  downloadFile,
  calculateDashboardMetrics,
} from '../../components/dashboard/DashboardUtils'
import {
  dashboardRepository,
  employeeRepository,
  leaveRequestRepository,
  onboardingRepository,
  offboardingRepository,
  holidayRepository,
} from '../../data/mockRepository'
import {
  getEmployees,
  getHolidays,
  getLeaveRequests,
  getOffboardingTasks,
  getOnboardingRequests,
} from '../../data/employeeStore'
import { isApiDataMode } from '../../lib/apiClient'
import { translations } from '../../contexts/I18nContext'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/authHooks'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import { calculateProfileCompletion } from '../../utils/profileCompletion'
import { formatDate, formatDateTime } from '../../utils/dates'
import {
  WorkforceAnalytics,
  GrowthChartCard,
  DepartmentDonutCard,
} from '../../components/dashboard/WorkforceAnalytics'
import '../../components/dashboard/ReferenceDashboard.css'
import type {
  Employee,
  Holiday,
  LeaveRequest,
  OffboardingRequest,
  OnboardingRequest,
  OnboardingStage,
} from '../../types/models'

// -----------------------------------------------------------------------------
// Helpers (outside the component so they are not recreated on every render)
// -----------------------------------------------------------------------------

// Turn an id that might be an object (e.g. { $oid: '...' }) into a plain string.
const toId = (id: unknown): string => {
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  if (id && typeof id === 'object') {
    const o = id as Record<string, unknown>
    return String(o.$oid ?? o.id ?? o.value ?? JSON.stringify(id))
  }
  return String(id)
}

// Turn a nested record (e.g. a department object) into its display name.
const toName = (value: unknown): string => {
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return String(o.name ?? o.code ?? o.id ?? '')
  }
  return value == null ? '' : String(value)
}

// Flatten every nested object field that looks like a record (has name/code/id)
// into a string, and make sure `id` is a string. Arrays and null are left alone.
const normalizeRecord = <T extends { id: unknown }>(record: T): T => {
  const out: Record<string, unknown> = { ...record }
  for (const [key, value] of Object.entries(out)) {
    if (key === 'id') {
      out.id = toId(value)
    } else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ('name' in value || 'code' in value || 'id' in value)
    ) {
      out[key] = toName(value)
    }
  }
  return out as T
}

const normalizeList = <T extends { id: unknown }>(list: T[] | undefined): T[] =>
  (list ?? []).map(normalizeRecord)

// Fill `{placeholder}` tokens in a translation string with real values.
const fmt = (template: string, vars: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))

const parseDay = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const d = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function DashboardPage() {
  // ---------------------------------------------------------------------------
  // Hooks: every hook must be called on every render, before any early return.
  // ---------------------------------------------------------------------------
  useEmployeeStore()
  const { language } = useI18n()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const t = translations[language]
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(isApiDataMode)
  const [apiError, setApiError] = useState<string | null>(null)

  const [employees, setEmployees] = useState<Employee[]>(() => (!isApiDataMode ? getEmployees() : []))
  const [onboardingRequests, setOnboardingRequests] = useState<OnboardingRequest[]>(() => (!isApiDataMode ? getOnboardingRequests() : []))
  const [offboardingRequests, setOffboardingRequests] = useState<OffboardingRequest[]>(() => (!isApiDataMode ? getOffboardingTasks() : []))
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => (!isApiDataMode ? getLeaveRequests() : []))
  const [holidays, setHolidays] = useState<Holiday[]>(() => (!isApiDataMode ? getHolidays() : []))

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setApiError(null)

    if (isApiDataMode) {
      dashboardRepository.getStatistics()
        .then((data) => {
          if (!active) return
          const dashboardData = data as {
            employees: Employee[]
            onboardingRequests: OnboardingRequest[]
            offboardingRequests: OffboardingRequest[]
            leaveRequests: LeaveRequest[]
            holidays: Holiday[]
          }
          setEmployees(normalizeList(dashboardData.employees))
          setOnboardingRequests(normalizeList(dashboardData.onboardingRequests))
          setOffboardingRequests(normalizeList(dashboardData.offboardingRequests))
          setLeaveRequests(normalizeList(dashboardData.leaveRequests))
          setHolidays(normalizeList(dashboardData.holidays))
        })
        .catch((err: unknown) => {
          console.error('Failed to load HR dashboard statistics from API:', err)
          setApiError('Failed to load dashboard statistics from server')
        })
        .finally(() => {
          if (active) setIsLoading(false)
        })
    } else {
      // Mock mode - load from local data
      Promise.all([
        employeeRepository.list().catch(() => ({ data: getEmployees() })),
        onboardingRepository.list().catch(() => ({ data: getOnboardingRequests() })),
        offboardingRepository.list().catch(() => ({ data: getOffboardingTasks() })),
        leaveRequestRepository.list().catch(() => ({ data: getLeaveRequests() })),
        holidayRepository.list().catch(() => ({ data: getHolidays() })),
      ])
        .then(([empRes, onbRes, offRes, leaveRes, holRes]) => {
          if (!active) return
          setEmployees(empRes.data)
          setOnboardingRequests(onbRes.data)
          setOffboardingRequests(offRes.data)
          setLeaveRequests(leaveRes.data)
          setHolidays(holRes.data)
        })
        .catch((err: unknown) => {
          console.error('Failed to load HR dashboard metrics:', err)
          setEmployees(getEmployees())
          setOnboardingRequests(getOnboardingRequests())
          setOffboardingRequests(getOffboardingTasks())
          setLeaveRequests(getLeaveRequests())
          setHolidays(getHolidays())
        })
        .finally(() => {
          if (active) setIsLoading(false)
        })
    }

    return () => {
      active = false
    }
  }, [])

  const metrics = useMemo(
    () =>
      calculateDashboardMetrics(employees, onboardingRequests, leaveRequests, offboardingRequests),
    [employees, onboardingRequests, leaveRequests, offboardingRequests]
  )
  const profileMetrics = useMemo(() => {
    if (!employees.length) return { average: 0, complete: 0, incomplete: 0 }
    const completedCount = employees.filter(
      (employee) => calculateProfileCompletion(employee).percentage === 100,
    ).length
    return {
      average: Math.round(
        employees.reduce((sum, employee) => sum + calculateProfileCompletion(employee).percentage, 0) /
          employees.length,
      ),
      complete: completedCount,
      incomplete: employees.length - completedCount,
    }
  }, [employees])
  const upcomingHolidays = useMemo(
    () =>
      holidays
        .filter((holiday) => holiday.date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3),
    [holidays],
  )
 const recentLeaveRequests = useMemo(
  () =>
    [...leaveRequests]
      .sort(
        (a, b) =>
          new Date(b.submittedAt ?? 0).getTime() -
          new Date(a.submittedAt ?? 0).getTime(),
      )
      .slice(0, 3),
  [leaveRequests],
)

  // New hires in the last 30 days, from the employees' real join dates.
  const hiresLast30Days = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    return employees.filter((employee) => {
      const joined = parseDay(employee.joined)
      return joined !== null && joined >= cutoff
    }).length
  }, [employees])

  // Workforce mix for the overview bar, from the employees' real statuses.
  const statusSegments = useMemo(() => {
    const onLeave = employees.filter((e) => e.status === 'On Leave').length
    const active = employees.filter((e) => e.status === 'Active').length
    const other = employees.length - active - onLeave
    return [
      { label: t.statusActive, count: active, color: 'var(--blue)' },
      { label: t.statusOnLeave, count: onLeave, color: 'var(--orange)' },
      { label: t.statusOther, count: other, color: 'var(--muted-2)' },
    ]
  }, [employees, t])

  // Greeting name comes from the logged-in session (GET /api/v1/auth/me).
  const displayName =
    currentUser?.firstName && currentUser?.lastName
      ? `${currentUser.firstName} ${currentUser.lastName}`
      : (currentUser?.name ?? '')
  const greeting = displayName ? `${t.hello} ${displayName}` : t.hello

  // Insight paragraph, built only from the live metrics.
  const insight = [
    fmt(metrics.activeEmployees === 1 ? t.insightActiveOne : t.insightActive, { active: metrics.activeEmployees, total: metrics.totalEmployees }),
    fmt(metrics.leavePending === 1 ? t.insightPendingOne : t.insightPending, { pending: metrics.leavePending }),
    fmt(metrics.activeOnboarding === 1 ? t.insightOnboardingOne : t.insightOnboarding, { onboarding: metrics.activeOnboarding }),
    fmt(t.insightOnLeave, { onLeave: metrics.onLeaveCount }),
  ].join('. ') + '.'

  // ---------------------------------------------------------------------------
  // Handlers (not hooks)
  // ---------------------------------------------------------------------------
  const handleExport = async () => {
    setIsExporting(true)
    try {
      const csv = generateExportCsv(employees)
      downloadFile(csv, `employees-export-${Date.now()}.csv`, 'text/csv')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCreateRequest = () => {
    navigate('/app/leave')
  }

  // ---------------------------------------------------------------------------
  // Early returns: safe here because all hooks have already been called.
  // ---------------------------------------------------------------------------
  if (isApiDataMode && isLoading) {
    return (
      <div className="page">
        <div className="empty-block">{'Loading...'}</div>
      </div>
    )
  }

  if (isApiDataMode && apiError) {
    return (
      <div className="page">
        <div className="empty-block">{apiError}</div>
        <button className="button primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="page dashboard-page ref-dashboard">
      <header className="ref-greeting">
        <div>
          <h1>{greeting}</h1>
          <p className="ref-insight">{insight}</p>
        </div>
        <div className="ref-actions">
          <button
            className="button secondary"
            onClick={handleExport}
            disabled={isExporting}
          >
            <FileText size={16} />
            {isExporting ? 'Exporting...' : t.export}
          </button>

          <button className="button primary" onClick={handleCreateRequest}>
            <Plus size={16} />
            {t.create}
          </button>
        </div>
      </header>

      <KpiStrip metrics={metrics} />

      <section className="ref-wide-card" aria-label={t.workforceOverview}>
        <span className="ref-wide-label">{t.workforceOverview}</span>
        <div className="ref-wide-head">
          <strong className="ref-wide-value">{metrics.activeEmployees}</strong>
          <span className={`ref-wide-delta ${hiresLast30Days === 0 ? 'neutral' : ''}`}>
            {hiresLast30Days > 0 && <ArrowUp size={13} />}
            {fmt(hiresLast30Days === 1 ? t.newHires30dOne : t.newHires30d, { count: hiresLast30Days })}
          </span>
        </div>
        <p className="ref-wide-note">{t.workforceOverviewNote}</p>
        <div
          className="ref-segmented-bar"
          role="img"
          aria-label={statusSegments.map((s) => `${s.label}: ${s.count}`).join(', ')}
        >
          {statusSegments.map((segment) => (
            <span
              key={segment.label}
              style={{
                width: `${employees.length ? (segment.count / employees.length) * 100 : 0}%`,
                background: segment.color,
              }}
            />
          ))}
        </div>
        <div className="ref-wide-legend">
          {statusSegments.map((segment) => (
            <span key={segment.label}>
              <i style={{ background: segment.color }} />
              {segment.label} <strong>{segment.count}</strong>
            </span>
          ))}
        </div>
      </section>

      <div className="ref-charts-row">
        <GrowthChartCard employees={employees} language={language} />
        <DepartmentDonutCard employees={employees} />
      </div>

      <div className="dashboard-grid">
        <WorkforceAnalytics
          employees={employees}
          leaveRequests={leaveRequests}
          holidays={holidays}
          onboardingRequests={onboardingRequests}
          offboardingRequests={offboardingRequests}
          language={language}
        />

        <section className="panel pulse-panel">
          <PanelTitle
            title="HR pulse"
            subtitle="Employee profile completeness"
            action={`${employees.length} records`}
          />

          <div className="pulse-ring" style={{ '--profile-completion': `${profileMetrics.average}%` } as CSSProperties}>
            <div>
              <strong>{profileMetrics.average}%</strong>
              <span>Average completion</span>
            </div>
          </div>

          <div className="pulse-stats">
            <span><i className="legend-dot blue" />{profileMetrics.complete} complete</span>
            <span><i className="legend-dot orange" />{profileMetrics.incomplete} need attention</span>
          </div>
        </section>

        <section className="panel workflow-panel">
          <PanelTitle
            title="Onboarding workflow"
            subtitle={`${metrics.activeOnboarding} active requests`}
            action="View all"
            onAction={() => navigate('/app/onboarding/requests')}
          />

          <div className="workflow-list">
            {([
              'HR Validation',
              'Manager Approval',
              'Local IT',
              'ISD',
              'Completed',
            ] as OnboardingStage[]).map((stage, index) => {
              const stageCount = onboardingRequests.filter((request) => request.stage === stage).length
              return (
                <div className="workflow-step" key={stage}>
                  <div
                    className={`step-icon ${stage === 'Completed' ? 'done' : stageCount ? 'current' : ''}`}
                  >
                    {stage === 'Completed' ? (
                      <CheckCircle2 size={15} />
                    ) : stageCount ? (
                      <Clock3 size={15} />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span>{stage}</span>
                  <strong>{stageCount}</strong>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel events-panel">
          <PanelTitle
            title="Upcoming holidays"
            subtitle="From the organization calendar"
            action="Open calendar"
            onAction={() => navigate('/app/calendar')}
          />
          {upcomingHolidays.length ? upcomingHolidays.map((holiday) => (
            <Event
              key={holiday.id}
              date={formatDate(holiday.date, language)}
              time="All day"
              title={holiday.name}
              detail={holiday.site ?? holiday.country ?? holiday.type}
              color={holiday.type === 'Public' ? 'blue' : 'mint'}
            />
          )) : <div className="analytics-empty">No upcoming holidays on the calendar.</div>}
        </section>

        <section className="panel activity-panel">
          <PanelTitle
            title="Recent leave requests"
            subtitle="Sorted by submission time"
            action="View requests"
            onAction={() => navigate('/app/leave/requests')}
          />
          {recentLeaveRequests.length ? recentLeaveRequests.map((request) => (
            <Activity
              key={request.id}
              icon={<CalendarDays size={15} />}
              title={`${request.employee} · ${request.type}`}
              detail={`${request.start} – ${request.end} · ${request.status}`}
              time={formatDateTime(request.submittedAt, language)}
            />
          )) : <div className="analytics-empty">No leave requests have been submitted.</div>}
        </section>
      </div>
    </div>
  )
}
