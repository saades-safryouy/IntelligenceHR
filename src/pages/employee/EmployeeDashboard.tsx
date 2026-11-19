import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  MapPin,
  UserRound,
} from 'lucide-react'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { apiData, isApiDataMode } from '../../lib/apiClient'
import { apiEmployeeRepository, type EmployeeDashboardData } from '../../data/apiEmployeeRepository'
import {
  ensureDynamicNotifications,
  getHolidays,
  getLeaveEntitlements,
  getLeaveRequests,
  getLeaveTypes,
  getMyNotifications,
  getMyOnboarding,
  getUnreadCount,
  isOnboardingTaskDone,
  markNotificationRead,
  resolveEmployee,
  updateEmployeeProfile,
} from '../../data/employeeStore'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import {
  daysUntil,
  formatDate,
  formatWeekday,
  getGreeting,
  getWeekDays,
  isSameDay,
} from '../../utils/employeeHelpers'
import { calculateProfileCompletion, shouldShowProfileReminder } from '../../utils/profileCompletion'
import { calculateLeaveBalances } from '../../utils/leave'
import { holidayAppliesToEmployee, holidaysForYear } from '../../utils/holidays'
import { passportAlertLevel } from '../../utils/passport'
import { employeeDashboardTranslations, interpolate } from './translations'
import {
  EmptyState,
  NotificationItem,
  ProgressBar,
  SectionLink,
  StatusBadge,
} from './components'

export function EmployeeDashboard() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const t = employeeDashboardTranslations[language]

  const [apiSummary, setApiSummary] = useState<EmployeeDashboardData | null>(null)
  const [summaryError, setSummaryError] = useState('')
  const [summaryReload, setSummaryReload] = useState(0)

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    setSummaryError('')
    apiEmployeeRepository.getSummary()
      .then((summary) => {
        if (active) setApiSummary(summary)
      })
      .catch((cause: unknown) => {
        console.error('Failed to load employee summary:', cause)
        if (active) setSummaryError(cause instanceof Error ? cause.message : t.loadFailed)
      })
    return () => { active = false }
  }, [summaryReload, t.loadFailed])

  const employee = isApiDataMode ? apiSummary?.employee : resolveEmployee(currentUser)

  useEffect(() => {
    if (employee && !isApiDataMode) ensureDynamicNotifications(employee)
  }, [employee])

  const myLeave = isApiDataMode
    ? (apiSummary?.leaveRequests ?? [])
    : (employee ? getLeaveRequests().filter((request) => request.userId === employee.userId) : [])

  if ((!currentUser && !isApiDataMode) || (isApiDataMode && apiSummary === null && !summaryError)) {
    return (
      <div className="page">
        <div className="empty-block">{t.loading}</div>
      </div>
    )
  }

  if (isApiDataMode && summaryError && !apiSummary) {
    return (
      <div className="page employee-home">
        <div className="toast-inline toast-error" role="alert">{summaryError}</div>
        <button className="button secondary" onClick={() => setSummaryReload((value) => value + 1)}>
          {t.tryAgain}
        </button>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="page">
        <div className="empty-block">{t.notFound}</div>
      </div>
    )
  }

  const leaveTypes = isApiDataMode ? (apiSummary?.leaveTypes ?? []) : getLeaveTypes()
  const leaveEntitlements = isApiDataMode ? (apiSummary?.leaveEntitlements ?? []) : getLeaveEntitlements()
  const allLeaveRequests = isApiDataMode ? (apiSummary?.leaveRequests ?? []) : getLeaveRequests()
  const holidaysList = isApiDataMode ? (apiSummary?.holidays ?? []) : getHolidays()
  const onboardingCases = isApiDataMode ? (apiSummary?.onboardingCases ?? []) : getMyOnboarding(employee.userId ?? employee.id)
  const unreadCountVal = isApiDataMode ? (apiSummary?.unreadCount ?? 0) : getUnreadCount(employee.userId ?? employee.id)
  const leaveLabel = (type: (typeof leaveTypes)[number] | undefined) => {
    if (!type) return t.leaveAnnual
    const key = type.code === 'sick' ? 'leaveSick' : type.code === 'unpaid' ? 'leaveUnpaid' : type.code === 'annual' ? 'leaveAnnual' : type.nameKey
    return t[key as keyof typeof t] || type.nameKey
  }

  const { percentage: profileCompletion, missing: missingFields } = calculateProfileCompletion(employee)
  const showNudge = shouldShowProfileReminder(employee)
  const balances = calculateLeaveBalances(
    employee.userId ?? employee.id,
    leaveTypes,
    leaveEntitlements,
    allLeaveRequests,
  )
  const annual = balances.find((b) => b.type.code === 'annual' || b.type.nameKey === 'leaveAnnual' || b.type.nameKey === 'annual_leave') ?? balances[0]
  const remaining = annual?.remaining ?? 0
  const pendingRequests = myLeave.filter((request) => request.status === 'pending')
  const year = new Date().getFullYear()
  const upcomingHolidays = holidaysForYear(holidaysList, year)
    .filter((holiday) => holidayAppliesToEmployee(holiday, employee))
    .map((holiday) => ({ ...holiday, inDays: daysUntil(holiday.date) }))
    .filter((holiday) => holiday.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays)
  const nextHoliday = upcomingHolidays[0]
  const onboarding = isApiDataMode ? (Array.isArray(onboardingCases) ? onboardingCases[0] ?? null : null) : getMyOnboarding(employee.userId ?? employee.id)
  const inbox = isApiDataMode ? [] : getMyNotifications(employee.userId).slice(0, 5)
  const apiInbox = apiSummary?.notifications.slice(0, 5) ?? []
  const unread = isApiDataMode ? unreadCountVal : getUnreadCount(employee.userId ?? employee.id)
  const week = getWeekDays()
  const today = new Date()
  const passportLevel = passportAlertLevel(employee.passportValidityDate)

  const snooze = async (until: string) => {
    if (isApiDataMode) {
      try {
        const updated = await apiEmployeeRepository.update(employee.id, { personalInfoDismissedUntil: until })
        if (!updated) throw new Error(t.notFound)
        setApiSummary((summary) => summary ? { ...summary, employee: updated } : summary)
      } catch (cause) {
        console.error('Failed to snooze profile reminder:', cause)
        setSummaryError(cause instanceof Error ? cause.message : t.saveFailed)
      }
      return
    }
    updateEmployeeProfile(employee.userId, { personalInfoDismissedUntil: until })
  }

  const dismissNotification = async (id: string) => {
    if (!isApiDataMode) {
      markNotificationRead(id)
      return
    }
    try {
      await apiData(`/api/v1/notifications/${id}/read`, { method: 'PATCH' })
      setApiSummary((summary) => summary ? {
        ...summary,
        notifications: summary.notifications.map((item) =>
          item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item,
        ),
        unreadCount: Math.max(0, summary.unreadCount - (summary.notifications.some((item) => item.id === id && !item.read_at) ? 1 : 0)),
      } : summary)
    } catch (cause) {
      console.error('Failed to mark notification as read:', cause)
      setSummaryError(cause instanceof Error ? cause.message : t.saveFailed)
    }
  }

  return (
    <div className="page employee-home">
      {summaryError && <div className="toast-inline toast-error" role="alert">{summaryError}</div>}
      <section className="employee-hero">
        <div className="employee-hero-main">
          <div className="avatar employee-hero-avatar">{employee.initials}</div>
          <div className="employee-hero-copy">
            <span className="eyebrow">{t.workspace}</span>
            <h1>
              {getGreeting(language)}, {employee.firstName}
            </h1>
            <p>
              {employee.jobTitle}
              <i />
              {employee.department}
              <i />
              <MapPin size={13} />
              {employee.location}
            </p>
            <div className="employee-hero-meta">
              <span>
                {t.employeeId} EMP-{employee.id}
              </span>
              <span>
                {t.reportsTo} {employee.manager}
              </span>
            </div>
          </div>
        </div>

        <div className="employee-hero-actions">
          <Link to="/employee/leave" className="button primary">
            <CalendarDays size={16} />
            {t.requestTimeOff}
          </Link>
        </div>
      </section>

      {passportLevel && (
        <section className={`profile-nudge ${passportLevel === 'expired' ? 'danger' : ''}`}>
          <div className="profile-nudge-copy">
            <strong>
              {passportLevel === 'expired'
                ? t.passportExpired
                : interpolate(
                    passportLevel === '30'
                      ? t.passportExpires30
                      : passportLevel === '60'
                        ? t.passportExpires60
                        : t.passportExpires90,
                    { days: String(daysUntil(employee.passportValidityDate!)) },
                  )}
            </strong>
            <p>
              {employee.passportValidityDate
                ? formatDate(employee.passportValidityDate, language)
                : ''}
            </p>
          </div>
          <Link to="/employee/documents" className="button secondary">
            {t.documents}
          </Link>
        </section>
      )}

      {showNudge && (
        <ProfileNudge
          percentage={profileCompletion}
          missing={missingFields}
          t={t}
          onSnooze={snooze}
        />
      )}

      <section className="kpi-grid employee-kpis">
        <article className="kpi-card">
          <div className="kpi-icon">
            <CalendarDays size={18} />
          </div>
          <span className="kpi-label">{t.leaveBalance}</span>
          <strong className="kpi-value">
            {remaining}
            <small>{t.days}</small>
          </strong>
          <div className="kpi-trend">
            {annual?.used ?? 0} {t.leaveUsed}
          </div>
        </article>

        <article className="kpi-card">
          <div className="kpi-icon warning">
            <Clock3 size={18} />
          </div>
          <span className="kpi-label">{t.pendingRequests}</span>
          <strong className="kpi-value">{pendingRequests.length}</strong>
          <div className="kpi-trend warning-text">{t.awaitingManager}</div>
        </article>

        <article className="kpi-card">
          <div className="kpi-icon">
            <ClipboardCheck size={18} />
          </div>
          <span className="kpi-label">{t.onboardingProgress}</span>
          <strong className="kpi-value">
            {onboarding ? onboarding.progress : '—'}
            {onboarding ? <small>%</small> : null}
          </strong>
          <div className="kpi-trend">{onboarding ? onboarding.stage : t.noOnboarding}</div>
        </article>

        <article className="kpi-card">
          <div className="kpi-icon">
            <CalendarDays size={18} />
          </div>
          <span className="kpi-label">{t.upcomingHolidays}</span>
          <strong className="kpi-value">
            {nextHoliday ? nextHoliday.inDays : '—'}
            {nextHoliday ? <small>{t.days}</small> : null}
          </strong>
          <div className="kpi-trend">{nextHoliday ? nextHoliday.name : t.noUpcomingHolidays}</div>
        </article>
      </section>

      <section className="panel quick-actions-panel">
        <div className="panel-title">
          <div>
            <h2>{t.iNeedTo}</h2>
            <span>{t.welcomeMessage}</span>
          </div>
        </div>
        <div className="quick-actions">
          <QuickAction to="/employee/leave" icon={<CalendarDays size={18} />} label={t.requestTimeOff} />
          <QuickAction to="/employee/profile" icon={<UserRound size={18} />} label={t.updateInfo} />
          <QuickAction to="/employee/documents" icon={<FolderOpen size={18} />} label={t.downloadDocs} />
          <QuickAction to="/employee/holidays" icon={<CalendarDays size={18} />} label={t.viewCalendar} />
          <QuickAction to="/employee/onboarding" icon={<ClipboardCheck size={18} />} label={t.navOnboarding} />
          <QuickAction to="/employee/offboarding" icon={<UserRound size={18} />} label={t.navOffboarding} />
          <QuickAction to="/employee/notifications" icon={<FileText size={18} />} label={t.navNotifications} />
        </div>
      </section>

      <div className="employee-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>{t.leaveBalances}</h2>
              <span>
                {remaining} {t.days} {t.remaining}
              </span>
            </div>
            <SectionLink to="/employee/leave">{t.viewAll}</SectionLink>
          </div>

          <div className="leave-balances">
            {balances.map((balance) => {
              const usedPercent = balance.entitlement
                ? Math.round((balance.used / balance.entitlement) * 100)
                : 0
              const tone = balance.type.code === 'sick' ? 'orange' : balance.type.code === 'unpaid' ? 'purple' : 'blue'
              return (
                <div className="leave-balance-row" key={balance.type.id}>
                  <div>
                    <strong>{leaveLabel(balance.type)}</strong>
                    <span>
                      {balance.remaining} {t.available} · {balance.used} {t.used} · {balance.pending} {t.pending}
                    </span>
                  </div>
                  <b>
                    {balance.remaining}
                    <small>{t.days}</small>
                  </b>
                  <ProgressBar percentage={usedPercent} tone={tone} label={`${balance.remaining} ${t.days}`} />
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>{t.thisWeek}</h2>
              <span>{t.workingWeek}</span>
            </div>
          </div>
          <div className="week-strip">
            {week.map((day) => {
              const holiday = upcomingHolidays.find((item) => {
                const parsed = Date.parse(item.date)
                return !Number.isNaN(parsed) && isSameDay(new Date(parsed), day)
              })
              const away = myLeave.some((request) => {
                if (request.status === 'rejected' || request.status === 'cancelled') return false
                const start = Date.parse(request.start)
                const end = Date.parse(request.end)
                if (Number.isNaN(start) || Number.isNaN(end)) return false
                const time = day.getTime()
                return time >= start && time <= end
              })
              return (
                <div
                  className={`week-day ${isSameDay(day, today) ? 'today' : ''} ${holiday ? 'holiday' : ''} ${away ? 'away' : ''}`}
                  key={day.toISOString()}
                >
                  <span>{formatWeekday(day, language)}</span>
                  <strong>{day.getDate()}</strong>
                  <small>
                    {holiday ? holiday.name : away ? t.onLeaveToday : isSameDay(day, today) ? t.today : ''}
                  </small>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel employee-span">
          <div className="panel-title">
            <div>
              <h2>{t.myRequests}</h2>
              <span>
                {pendingRequests.length} {t.pending}
              </span>
            </div>
            <SectionLink to="/employee/leave">{t.viewAll}</SectionLink>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.type}</th>
                  <th>{t.dateRange}</th>
                  <th>{t.duration}</th>
                  <th>{t.backup}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {myLeave.length ? (
                  myLeave.slice(0, 4).map((request) => (
                    <tr key={request.id}>
                      <td>{leaveLabel(leaveTypes.find((type) => type.id === request.typeId))}</td>
                      <td>
                        {formatDate(request.start, language)} – {formatDate(request.end, language)}
                      </td>
                      <td>
                        {request.duration} {request.duration === 1 ? t.day : t.days}
                      </td>
                      <td>{request.backup || t.none}</td>
                      <td>
                        <StatusBadge
                          status={request.status}
                          label={t[request.status === 'approved' ? 'statusApproved' : request.status === 'rejected' ? 'statusRejected' : request.status === 'cancelled' ? 'statusCancelled' : 'statusPending']}
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title={t.noLeaveRequests} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>{t.notifications}</h2>
              <span>
                {unread} {t.unread}
              </span>
            </div>
            <SectionLink to="/employee/notifications">{t.viewAll}</SectionLink>
          </div>
          {(isApiDataMode ? apiInbox : inbox).length ? (
            isApiDataMode ? apiInbox.map((item) => item.resource_type === 'workflow_instance' && item.resource_id ? (
              <Link
                className={`notification notification-button ${item.read_at ? 'read' : 'unread'}`}
                key={item.id}
                to={`/employee/workflows/${item.resource_id}`}
                onClick={() => void dismissNotification(item.id)}
              >
                <span className="notification-copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{formatDate(item.created_at, language)}</small>
                </span>
              </Link>
            ) : (
              <button
                type="button"
                className={`notification notification-button ${item.read_at ? 'read' : 'unread'}`}
                key={item.id}
                onClick={() => void dismissNotification(item.id)}
              >
                <span className="notification-copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{formatDate(item.created_at, language)}</small>
                </span>
              </button>
            )) : inbox.map((item) => (
              <NotificationItem
                key={item.id}
                notification={item}
                t={t}
                language={language}
                dismissLabel={t.dismissNotification}
                onDismiss={(id) => { dismissNotification(id) }}
              />
            ))
          ) : (
            <EmptyState title={t.noNotifications} />
          )}
        </section>

        {onboarding && (
          <section className="panel">
            <div className="panel-title">
              <div>
                <h2>{t.navOnboarding}</h2>
                <span>
                  {onboarding.stage} · {onboarding.progress}%
                </span>
              </div>
              <SectionLink to="/employee/onboarding">{t.viewAll}</SectionLink>
            </div>
            <div className="onboarding-summary" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ProgressBar percentage={onboarding.progress} tone="mint" label={`${onboarding.progress}%`} />
              <ul className="holiday-board" style={{ margin: 0, padding: 0 }}>
                {onboarding.employeeTasks
                  .filter((task) => task.employeeVisible)
                  .slice(0, 3)
                  .map((task) => {
                    const done = isOnboardingTaskDone(task.id, onboarding)
                    return (
                      <li key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{t[task.labelKey as keyof typeof t] || task.labelKey}</span>
                        <StatusBadge status={done ? 'approved' : 'pending'} label={done ? t.taskDone : t.taskPending} />
                      </li>
                    )
                  })}
              </ul>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>{t.upcomingHolidays}</h2>
              <span>{t.holidaysSubtitle}</span>
            </div>
            <SectionLink to="/employee/holidays">{t.viewAll}</SectionLink>
          </div>
          {upcomingHolidays.length ? (
            <ul className="holiday-list">
              {upcomingHolidays.slice(0, 3).map((holiday) => (
                <li key={holiday.id}>
                  <div>
                    <strong>{t[holiday.nameKey as keyof typeof t] || holiday.name}</strong>
                    <span>
                      {holiday.type === 'Public' ? t.publicHoliday : t.companyHoliday} · {holiday.inDays} {t.daysAway}
                    </span>
                  </div>
                  <time>{formatDate(holiday.date, language)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t.noUpcomingHolidays} />
          )}
        </section>
      </div>
    </div>
  )
}

function ProfileNudge({
  percentage,
  missing,
  t,
  onSnooze,
}: {
  percentage: number
  missing: string[]
  t: (typeof employeeDashboardTranslations)[keyof typeof employeeDashboardTranslations]
  onSnooze: (until: string) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const defaultDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })()
  const [until, setUntil] = useState(defaultDate)

  return (
    <section className="profile-nudge">
      <div className="profile-nudge-copy">
        <strong>{t.profileCompletion}</strong>
        <p>{t.completeYourProfile}</p>
        <ProgressBar percentage={percentage} tone="orange" label={`${percentage}%`} />
        <small>
          {percentage}% · {missing.map((field) => t[field as keyof typeof t] || field).join(' · ')}
        </small>
      </div>
      <div className="profile-nudge-actions">
        <Link to="/employee/profile?edit=1" className="button primary">
          {t.completeProfile}
        </Link>
        {open ? (
          <form
            className="snooze-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onSnooze(until)
              setOpen(false)
            }}
          >
            <label>
              {t.snoozeUntil}
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="button secondary">
              {t.snoozeConfirm}
            </button>
            <button type="button" className="button ghost" onClick={() => setOpen(false)}>
              {t.snoozeCancel}
            </button>
          </form>
        ) : (
          <button className="button ghost" onClick={() => setOpen(true)}>
            {t.remindMeLater}
          </button>
        )}
      </div>
    </section>
  )
}

function QuickAction({
  to,
  icon,
  label,
}: {
  to: string
  icon: ReactNode
  label: string
}) {
  return (
    <Link to={to} className="quick-action">
      <span className="quick-action-icon">{icon}</span>
      <strong>{label}</strong>
      <ArrowRight size={15} />
    </Link>
  )
}
