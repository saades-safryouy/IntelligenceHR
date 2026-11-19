import { useState, useMemo, useEffect } from 'react'
import type { CSSProperties } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Laptop,
  LogOut,
  Plus,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Event } from '../../components/dashboard/Event'
import { Activity } from '../../components/dashboard/Activity'
import { PageHeader } from '../../components/common/PageHeader'
import { PanelTitle } from '../../components/common/PanelTitle'
import { Breadcrumb } from '../../components/common/Breadcrumb'
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
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import { calculateProfileCompletion } from '../../utils/profileCompletion'
import { formatDate, formatDateTime } from '../../utils/dates'
import { WorkforceAnalytics } from '../../components/dashboard/WorkforceAnalytics'
import { ProfessionalAnalytics } from '../../components/dashboard/ProfessionalAnalytics'
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

export function DashboardPage() {
  // ---------------------------------------------------------------------------
  // Hooks: every hook must be called on every render, before any early return.
  // ---------------------------------------------------------------------------
  useEmployeeStore()
  const { language } = useI18n()
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
);

  // Get today's date
  const today = useMemo(() => {
    const date = new Date()
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).toUpperCase()
  }, [])

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
    <div className="page dashboard-page">
      <Breadcrumb
        items={[
          { label: t.dashboard },
        ]}
      />

      <PageHeader
        eyebrow={today}
        title="HR workspace overview"
        subtitle="Here is what is happening across IntillegenceHR today."
      >
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
      </PageHeader>

      <section className="kpi-grid">
        <KpiCard
          label={t.employees}
          value={metrics.totalEmployees.toString()}
          trend={`${metrics.activeEmployees} active`}
          note="employee records"
          icon={<Users size={18} />}
        />

        <KpiCard
          label={t.activeOnboarding}
          value={metrics.activeOnboarding.toString()}
          trend={metrics.onboardingAtRisk.toString()}
          note="requiring attention"
          icon={<ClipboardCheck size={18} />}
          warning={metrics.onboardingAtRisk > 0}
        />

        <KpiCard
          label={t.activeOffboarding}
          value={metrics.activeOffboarding.toString()}
          trend={metrics.offboardingOverdue.toString()}
          note="overdue workflows"
          icon={<LogOut size={18} />}
          warning={metrics.offboardingOverdue > 0}
        />

        <KpiCard
          label={t.onLeave}
          value={metrics.onLeaveCount.toString()}
          trend={`${metrics.leavePending}`}
          note="pending approvals"
          icon={<CalendarDays size={18} />}
        />

        <KpiCard
          label="Active employees"
          value={`${metrics.totalEmployees ? Math.round((metrics.activeEmployees / metrics.totalEmployees) * 100) : 0}%`}
          trend={metrics.activeEmployees.toString()}
          note="of total workforce"
          icon={<Laptop size={18} />}
        />
      </section>

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