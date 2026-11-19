import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Search, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import {
  getVisibleReportingDescendants,
  listVisibleEmployees,
} from '../../data/managerDashboardRepository'
import type { Employee, EmployeeStatus } from '../../types/models'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

const teamPermissions = ['people.employee.view.all', 'people.employee.view.department']

export function ManagerTeamPage() {
  const { currentUser, hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = managerTranslations[language]
  const managerId = Number(currentUser?.employeeId)
  const hasEmployeeLink = Number.isSafeInteger(managerId) && managerId > 0
  const canViewTeam = teamPermissions.some(hasPermission)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | EmployeeStatus>('all')
  const [loading, setLoading] = useState(isApiDataMode && canViewTeam && hasEmployeeLink)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const load = useCallback(async () => {
    if (!isApiDataMode || !canViewTeam || !hasEmployeeLink) return
    setLoading(true)
    setError('')
    try {
      setEmployees(await listVisibleEmployees())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canViewTeam, copy.loadError, hasEmployeeLink])

  useEffect(() => { void load() }, [load, retry])

  const team = useMemo(
    () => hasEmployeeLink ? getVisibleReportingDescendants(employees, managerId) : [],
    [employees, hasEmployeeLink, managerId],
  )
  const visibleTeam = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return team.filter((employee) => (
      (status === 'all' || employee.status === status)
      && (!term || `${employee.firstName} ${employee.lastName} ${employee.jobTitle} ${employee.positionTitle ?? ''} ${employee.department} ${employee.team ?? ''}`
        .toLocaleLowerCase()
        .includes(term))
    ))
  }, [search, status, team])
  const statusLabels: Record<EmployeeStatus, string> = {
    Active: copy.active,
    'On Leave': copy.onLeave,
    Suspended: copy.suspended,
    Terminated: copy.terminated,
  }

  if (!isApiDataMode) return <ManagerApiNotice message={copy.apiRequired} />

  return (
    <div className="page manager-page">
      <PageHeader eyebrow={copy.team} title={copy.teamMembers} subtitle={copy.searchableTeam}>
        <span className="manager-team-count">{visibleTeam.length} / {team.length}</span>
      </PageHeader>

      {!canViewTeam ? (
        <div className="manager-api-notice">{copy.noTeamAccess}</div>
      ) : !hasEmployeeLink ? (
        <div className="manager-api-notice">{copy.teamUnavailable}</div>
      ) : (
        <>
          <section className="manager-directory-toolbar">
            <label className="manager-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchTeam} aria-label={copy.searchTeam} />
            </label>
            <label className="manager-status-filter">
              <span>{copy.status}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | EmployeeStatus)}>
                <option value="all">{copy.allStatuses}</option>
                <option value="Active">{copy.active}</option>
                <option value="On Leave">{copy.onLeave}</option>
                <option value="Suspended">{copy.suspended}</option>
                <option value="Terminated">{copy.terminated}</option>
              </select>
            </label>
          </section>

          {error && <div className="manager-alert" role="alert"><span>{error}</span><button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>{copy.retry}</button></div>}
          {loading ? <div className="manager-loading" role="status"><span className="manager-spinner" />{copy.loading}</div> : null}
          {!loading && !error && visibleTeam.length ? (
            <section className="manager-team-grid" aria-label={copy.teamMembers}>
              {visibleTeam.map((employee) => (
                <Link to={`/manager/team/${employee.id}`} className="manager-team-card" key={employee.id}>
                  <div className="manager-team-card-top">
                    <span className="manager-avatar large">{employee.initials || `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`}</span>
                    <span className={`manager-status-pill ${employee.status === 'Active' ? 'active' : 'quiet'}`}>{statusLabels[employee.status]}</span>
                  </div>
                  <strong className="manager-team-name">{employee.firstName} {employee.lastName}</strong>
                  <span className="manager-team-role">{employee.positionTitle || employee.jobTitle}</span>
                  <div className="manager-team-meta"><span>{employee.department || '—'}</span><span>{employee.team || '—'}</span></div>
                  <div className="manager-reports-to"><UsersRound size={14} /><span>{copy.reportsTo}</span><strong>{employee.manager || '—'}</strong><ArrowUpRight size={14} /></div>
                </Link>
              ))}
            </section>
          ) : !loading && !error ? (
            <div className="manager-empty large-empty"><span /><p>{team.length ? copy.searchEmpty : copy.noTeam}</p></div>
          ) : null}
        </>
      )}
    </div>
  )
}
