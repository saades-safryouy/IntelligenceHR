import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import {
  cancelLeaveRequest,
  getEmployees,
  getHolidays,
  getLeaveEntitlements,
  getLeaveRequests,
  getLeaveTypes,
  resolveEmployee,
  submitLeaveRequest,
} from '../../data/employeeStore'
import { apiEmployeeRepository, type EmployeeDashboardData } from '../../data/apiEmployeeRepository'
import { apiData, isApiDataMode } from '../../lib/apiClient'
import type { HalfDay, LeaveRequest } from '../../types/models'
import { employeeFullName, formatDate } from '../../utils/employeeHelpers'
import { calculateLeaveBalances, hasLeaveOverlap, workingLeaveDays } from '../../utils/leave'
import { employeeDashboardTranslations } from './translations'
import { EmptyState, ProgressBar, StatusBadge } from './components'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'

export function EmployeeLeavePage() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const location = useLocation()
  const t = employeeDashboardTranslations[language]
  const [apiSummary, setApiSummary] = useState<EmployeeDashboardData | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<LeaveRequest | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const employee = isApiDataMode ? apiSummary?.employee : resolveEmployee(currentUser)
  const types = isApiDataMode ? apiSummary?.leaveTypes ?? [] : getLeaveTypes()
  const colleagues = isApiDataMode ? [] : getEmployees().filter((person) => person.userId !== employee?.userId)
  const requests = useMemo(() => isApiDataMode
    ? apiSummary?.leaveRequests ?? []
    : employee ? getLeaveRequests().filter((request) => request.userId === employee.userId) : [], [apiSummary, employee])

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    setLoading(true)
    setError('')
    apiEmployeeRepository.getSummary()
      .then((summary) => { if (active) setApiSummary(summary) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : t.loadFailed) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload, t.loadFailed])

  useEffect(() => {
    const requestId = location.hash.startsWith('#request-')
      ? decodeURIComponent(location.hash.slice('#request-'.length))
      : ''
    const selected = requests.find((request) => request.id === requestId)
    if (selected) {
      setDetail(selected)
      document.getElementById(`request-${requestId}`)?.scrollIntoView({ block: 'center' })
    }
  }, [location.hash, requests])

  if (loading) {
    return <div className="page employee-page"><div className="empty-block" role="status">{t.loading}</div></div>
  }

  if (!employee && !error) {
    return (
      <div className="page">
        <div className="empty-block">{t.notFound}</div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="page employee-page">
        <div className="toast-inline toast-error" role="alert">{error}</div>
        <button className="button secondary" onClick={() => setReload((value) => value + 1)}>{t.tryAgain}</button>
      </div>
    )
  }

  const entitlements = isApiDataMode ? apiSummary?.leaveEntitlements ?? [] : getLeaveEntitlements()
  const balances = calculateLeaveBalances(employee.userId, types, entitlements, requests)
  const leaveLabel = (typeId: string) => {
    const type = types.find((item) => item.id === typeId)
    if (!type) return typeId
    const key = type.code === 'sick' ? 'leaveSick' : type.code === 'unpaid' ? 'leaveUnpaid' : type.code === 'annual' ? 'leaveAnnual' : type.nameKey
    return t[key as keyof typeof t] || type.nameKey
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const typeId = String(data.get('type') || types[0].id)
    const start = String(data.get('start') || '')
    const end = String(data.get('end') || start)
    const fromHalf = String(data.get('fromHalf') || 'full') as HalfDay
    const toHalf = String(data.get('toHalf') || 'full') as HalfDay
    const note = String(data.get('note') || '')
    const backupUserIdRaw = String(data.get('backup') || '')
    const backupUserId = backupUserIdRaw ? Number(backupUserIdRaw) : null
    const backupPerson = colleagues.find((person) => person.userId === backupUserId)

    if (!start || !end || end < start) {
      setError(t.invalidDates)
      return
    }

    if (isApiDataMode) {
      if (busy) return
      setBusy(true)
      try {
        await apiData('/api/v1/leave-requests', {
          method: 'POST',
          body: JSON.stringify({
            leave_type_id: typeId,
            start_date: start,
            end_date: end,
            from_half: fromHalf,
            to_half: toHalf,
            backup_employee_id: backupUserId,
            note,
          }),
        })
        setOpen(false)
        setMessage(t.requestSent)
        setReload((value) => value + 1)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t.saveFailed)
      } finally {
        setBusy(false)
      }
      return
    }

    const duration = workingLeaveDays(start, end, getHolidays(), employee, fromHalf, toHalf)
    if (duration <= 0) {
      setError(t.invalidDates)
      return
    }
    if (hasLeaveOverlap(getLeaveRequests(), employee.userId, start, end)) {
      setError(t.overlapError)
      return
    }
    const balance = balances.find((item) => item.type.id === typeId)
    if (balance && duration > balance.remaining) {
      setError(t.insufficientBalance)
      return
    }
    submitLeaveRequest({
      userId: employee.userId,
      employee: employeeFullName(employee),
      typeId,
      type: typeId,
      start,
      end,
      fromHalf,
      toHalf,
      duration,
      backup: backupPerson ? employeeFullName(backupPerson) : '',
      backupUserId,
      note,
      status: 'pending',
      submittedAt: new Date().toISOString(),
    })
    setOpen(false)
    setMessage(t.requestSent)
  }

  const cancelPending = (request: LeaveRequest) => {
    if (!window.confirm(t.cancelConfirm)) return
    if (!isApiDataMode && cancelLeaveRequest(request.id, employee.userId)) {
      setDetail(null)
      setMessage(t.requestCancelled)
    }
  }

  return (
    <div className="page employee-page">
      <PageHeader eyebrow={t.employeePortal} title={t.leavePageTitle} subtitle={t.leavePageSubtitle}>
        <button className="button primary" disabled={busy || types.length === 0} onClick={() => setOpen(true)}>
          {t.newRequest}
        </button>
      </PageHeader>

      {message && <div className="toast-inline" role="status">{message}</div>}
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}

      <section className="kpi-grid employee-kpis">
        {balances.map((balance) => {
          const usedPercent = balance.entitlement ? Math.round((balance.used / balance.entitlement) * 100) : 0
          return (
            <article className="kpi-card" key={balance.type.id}>
              <span className="kpi-label">{leaveLabel(balance.type.id)}</span>
              <strong className="kpi-value">
                {balance.remaining}
                <small>{t.days}</small>
              </strong>
              <ProgressBar
                percentage={usedPercent}
                tone={balance.type.code === 'sick' ? 'orange' : balance.type.code === 'unpaid' ? 'purple' : 'blue'}
                label={`${balance.remaining} ${t.days}`}
              />
              <div className="kpi-trend">
                {balance.used} {t.used} · {balance.pending} {t.pending} · {balance.entitlement} {t.of} {balance.entitlement}
              </div>
            </article>
          )
        })}
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{t.myRequests}</h2>
            <span>
              {requests.filter((request) => request.status === 'pending').length} {t.pending}
            </span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>{t.type}</th>
                <th>{t.dateRange}</th>
                <th>{t.duration}</th>
                <th>{t.backup}</th>
                <th>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {requests.length ? (
                requests.map((request) => (
                  <tr id={`request-${request.id}`} key={request.id} onClick={() => setDetail(request)} style={{ cursor: 'pointer' }}>
                    <td>{request.id}</td>
                    <td>{leaveLabel(request.typeId)}</td>
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
                  <td colSpan={6}>
                    <EmptyState title={t.noLeaveRequests} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <LeaveDrawer
          t={t}
          types={types}
          colleagues={colleagues}
          employee={employee}
          error={error}
          saving={busy}
          apiMode={isApiDataMode}
          onClose={() => { setOpen(false); setError('') }}
          onSubmit={submit}
        />
      )}

      {detail && (
        <div className="drawer-backdrop" onClick={() => setDetail(null)}>
          <aside className="employee-drawer leave-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="drawer-header">
              <span>{detail.id}</span>
              <button className="icon-button" onClick={() => setDetail(null)} aria-label={t.cancel}>
                ×
              </button>
            </div>
            <div className="leave-form">
              <p><strong>{t.type}</strong> {leaveLabel(detail.typeId)}</p>
              <p><strong>{t.dateRange}</strong> {formatDate(detail.start, language)} – {formatDate(detail.end, language)}</p>
              <p><strong>{t.duration}</strong> {detail.duration} {t.workingDays}</p>
              <p><strong>{t.backup}</strong> {detail.backup || t.none}</p>
              <p><strong>{t.note}</strong> {detail.note || '—'}</p>
              <p><strong>{t.submittedAt}</strong> {formatDate(detail.submittedAt, language)}</p>
              <p>
                <strong>{t.status}</strong>{' '}
                <StatusBadge
                  status={detail.status}
                  label={t[detail.status === 'approved' ? 'statusApproved' : detail.status === 'rejected' ? 'statusRejected' : detail.status === 'cancelled' ? 'statusCancelled' : 'statusPending']}
                />
              </p>
              {detail.status === 'pending' && !isApiDataMode && (
                <button className="button secondary" onClick={() => cancelPending(detail)}>
                  {t.cancelRequest}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function LeaveDrawer({
  t,
  types,
  colleagues,
  employee,
  error,
  saving,
  apiMode,
  onClose,
  onSubmit,
}: {
  t: (typeof employeeDashboardTranslations)[keyof typeof employeeDashboardTranslations]
  types: ReturnType<typeof getLeaveTypes>
  colleagues: ReturnType<typeof getEmployees>
  employee: NonNullable<ReturnType<typeof resolveEmployee>>
  error: string
  saving: boolean
  apiMode: boolean
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [fromHalf, setFromHalf] = useState<HalfDay>('full')
  const [toHalf, setToHalf] = useState<HalfDay>('full')
  const preview = !apiMode && start && end
    ? workingLeaveDays(start, end, getHolidays(), employee, fromHalf, toHalf)
    : 0

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="employee-drawer leave-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <span>{t.newRequest}</span>
          <button className="icon-button" onClick={onClose} aria-label={t.cancel}>
            ×
          </button>
        </div>
        <form className="leave-form" onSubmit={onSubmit}>
          {error && <div className="toast-inline toast-error">{error}</div>}
          <label>
            {t.type}
            <select name="type" defaultValue={types[0].id}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {t[type.nameKey as keyof typeof t] || type.nameKey}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.from}
            <input name="start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            {t.to}
            <input name="end" type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            {t.fullDay} ({t.from})
            <select name="fromHalf" value={fromHalf} onChange={(e) => setFromHalf(e.target.value as HalfDay)}>
              <option value="full">{t.fullDay}</option>
              <option value="AM">{t.halfDayAM}</option>
              <option value="PM">{t.halfDayPM}</option>
            </select>
          </label>
          <label>
            {t.fullDay} ({t.to})
            <select name="toHalf" value={toHalf} onChange={(e) => setToHalf(e.target.value as HalfDay)}>
              <option value="full">{t.fullDay}</option>
              <option value="AM">{t.halfDayAM}</option>
              <option value="PM">{t.halfDayPM}</option>
            </select>
          </label>
          {!apiMode && preview > 0 && (
            <p className="missing-fields">
              {preview} {t.workingDays} {t.excludingHolidays}
            </p>
          )}
          {colleagues.length > 0 && <label>
            {t.backupColleague}
            <select name="backup" defaultValue="">
              <option value="">{t.selectBackup}</option>
              {colleagues.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {employeeFullName(person)}
                </option>
              ))}
            </select>
          </label>}
          <label>
            {t.reason}
            <input name="note" placeholder={t.reason} />
          </label>
          <div className="leave-form-actions">
            <button type="button" className="button secondary" onClick={onClose}>
              {t.cancel}
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving ? t.saving : t.submitRequest}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
