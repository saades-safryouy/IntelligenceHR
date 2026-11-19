import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, CheckCheck, Clock3, Network, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import {
  getVisibleReportingDescendants,
  listVisibleEmployees,
  listVisibleLeaveRequests,
  listVisibleWorkflows,
} from '../../data/managerDashboardRepository'
import type { Employee, LeaveRequest } from '../../types/models'
import type { WorkflowInstance } from '../../data/apiWorkflowRepository'
import { managerTranslations } from './translations'
import './ManagerDashboard.css'

const employeeVisibilityPermissions = [
  'people.employee.view.all',
  'people.employee.view.department',
]

function isUpcomingAbsence(leave: LeaveRequest, today: string, lastDay: string): boolean {
  return leave.status === 'approved' && leave.end >= today && leave.start <= lastDay
}

function workflowTimestamp(instance: WorkflowInstance): string {
  return instance.updated_at ?? instance.submitted_at ?? ''
}

function workflowLabel(status: string, copy: (typeof managerTranslations)['en']): string {
  const labels: Record<string, string> = {
    pending_approval: copy.pending,
    approved: copy.approved,
    rejected: copy.rejected,
    returned_for_correction: copy.returned,
    cancelled: copy.cancelled,
  }
  return labels[status] ?? status
}

export function ManagerDashboardPage() {
  const { currentUser, hasPermission } = useAuth()
  const { language, text } = useI18n()
  const copy = managerTranslations[language]
  const canViewTeam = employeeVisibilityPermissions.some(hasPermission)
  const canViewApprovals = hasPermission('workflow.approve')
  const managerId = Number(currentUser?.employeeId)
  const linkedEmployee = Number.isSafeInteger(managerId) && managerId > 0
  const [employees, setEmployees] = useState<Employee[]>([])
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([])
  const [pendingAssignments, setPendingAssignments] = useState<WorkflowInstance[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    if (!isApiDataMode) return
    setLoading(true)
    setError('')
    try {
      const [visibleEmployees, pendingLeaves, approvedLeaves, currentAssignments, relatedWorkflows] = await Promise.all([
        canViewTeam && linkedEmployee ? listVisibleEmployees() : Promise.resolve([]),
        canViewTeam && linkedEmployee ? listVisibleLeaveRequests('pending') : Promise.resolve([]),
        canViewTeam && linkedEmployee ? listVisibleLeaveRequests('approved') : Promise.resolve([]),
        canViewApprovals ? listVisibleWorkflows({ assignedToMe: true, status: 'pending_approval' }) : Promise.resolve([]),
        canViewApprovals ? listVisibleWorkflows({ team: true }) : Promise.resolve([]),
      ])
      setEmployees(visibleEmployees)
      setLeaves([...pendingLeaves, ...approvedLeaves])
      setPendingAssignments(currentAssignments)
      setWorkflows(relatedWorkflows)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canViewApprovals, canViewTeam, copy.loadError, linkedEmployee])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const team = useMemo(
    () => linkedEmployee ? getVisibleReportingDescendants(employees, managerId) : [],
    [employees, linkedEmployee, managerId],
  )
  const directReports = useMemo(
    () => team.filter((employee) => employee.managerId === managerId),
    [managerId, team],
  )
  const today = new Date().toISOString().slice(0, 10)
  const lastDay = new Date(Date.parse(`${today}T00:00:00.000Z`) + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const teamEmployeeIds = useMemo(() => new Set(team.map((employee) => employee.id)), [team])
  const teamLeaves = leaves.filter((leave) => teamEmployeeIds.has(leave.userId))
  const pendingTeamLeaves = teamLeaves.filter((leave) => leave.status === 'pending')
  const upcomingLeaves = leaves
    .filter((leave) => teamEmployeeIds.has(leave.userId))
    .filter((leave) => isUpcomingAbsence(leave, today, lastDay))
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(0, 5)
  const pendingApprovals = pendingAssignments.filter((item) => item.status === 'pending_approval')
  const recentWorkflows = [...workflows]
    .sort((left, right) => workflowTimestamp(right).localeCompare(workflowTimestamp(left)))
    .slice(0, 5)
  const activeTeamCount = team.filter((employee) => employee.status === 'Active').length

  if (!isApiDataMode) {
    return <ManagerApiNotice message={copy.apiRequired} />
  }

  return (
    <div className="page manager-page">
      <PageHeader eyebrow={copy.overview} title={copy.welcome} subtitle={copy.overviewSubtitle}>
        <button type="button" className="button secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <Clock3 size={15} />{text('Refresh')}
        </button>
      </PageHeader>

      <section className="manager-brief">
        <div className="manager-brief-mark"><Network size={20} /></div>
        <div className="manager-brief-copy">
          <span>{copy.portal} · {copy.today}</span>
          <strong>{currentUser?.name ?? '—'}</strong>
          <p>{copy.roleDescription}</p>
        </div>
        <div className="manager-brief-date">{new Date().toLocaleDateString(language, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </section>

      {error && (
        <div className="manager-alert" role="alert">
          <span>{error || copy.loadError}</span>
          <button type="button" className="button secondary" onClick={() => setRefreshKey((value) => value + 1)}>{copy.retry}</button>
        </div>
      )}

      {loading ? (
        <div className="manager-loading" role="status"><span className="manager-spinner" />{copy.loading}</div>
      ) : (
        <>
          <section className="manager-metrics" aria-label={copy.overview}>
            <MetricCard icon={<UsersRound size={18} />} label={copy.directReports} value={canViewTeam && linkedEmployee ? String(directReports.length) : '—'} footnote={copy.teamMembers} accent="blue" to="/manager/team" />
            <MetricCard icon={<Network size={18} />} label={copy.teamSize} value={canViewTeam && linkedEmployee ? String(team.length) : '—'} footnote={canViewTeam && linkedEmployee ? `${activeTeamCount} ${copy.active.toLowerCase()}` : copy.noTeamAccess} accent="mint" to="/manager/team" />
            <MetricCard icon={<CheckCheck size={18} />} label={copy.pendingApprovals} value={canViewApprovals ? String(pendingApprovals.length) : '—'} footnote={canViewApprovals ? copy.approvalDescription : copy.noApprovals} accent="orange" to="/manager/approvals" />
            <MetricCard icon={<CalendarDays size={18} />} label={copy.pendingLeave} value={canViewTeam && linkedEmployee ? String(pendingTeamLeaves.length) : '—'} footnote={copy.upcomingAbsences} accent="rose" to="/manager/leave" />
          </section>

          <div className="manager-dashboard-grid">
            <section className="panel manager-panel manager-team-panel">
              <PanelHeading kicker={copy.identity} title={copy.teamMembers} description={copy.searchableTeam} icon={<UsersRound size={18} />} />
              {!canViewTeam ? (
                <EmptyBlock title={copy.noTeamAccess} />
              ) : !linkedEmployee ? (
                <EmptyBlock title={copy.teamUnavailable} />
              ) : team.length ? (
                <div className="manager-people-list">
                  {team.slice(0, 5).map((employee) => (
                    <Link to={`/manager/team/${employee.id}`} className="manager-person-row" key={employee.id}>
                      <PersonAvatar employee={employee} />
                      <span className="manager-person-copy"><strong>{employee.firstName} {employee.lastName}</strong><small>{employee.positionTitle || employee.jobTitle}</small></span>
                      <span className={`manager-status-dot ${employee.status === 'Active' ? 'active' : ''}`} title={employee.status} />
                      <ArrowUpRight size={15} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyBlock title={copy.noTeam} />
              )}
              {canViewTeam && team.length > 5 && <Link className="manager-panel-link" to="/manager/team">{copy.viewAll}<ArrowUpRight size={14} /></Link>}
            </section>

            <section className="panel manager-panel manager-approval-panel">
              <PanelHeading kicker={copy.approvals} title={copy.approvalInbox} description={copy.approvalDescription} icon={<CheckCheck size={18} />} />
              {!canViewApprovals ? (
                <EmptyBlock title={copy.noApprovals} />
              ) : pendingApprovals.length ? (
                <div className="manager-approval-list">
                  {pendingApprovals.slice(0, 5).map((item) => (
                    <Link to={`/manager/workflows/${item.id}`} className="manager-approval-row" key={item.id}>
                      <span className="manager-approval-marker"><Clock3 size={15} /></span>
                      <span className="manager-approval-copy">
                        <strong>{item.version?.template?.name ?? item.resource_type}</strong>
                        <small>{item.initiator?.name ?? item.initiator_user_id} · {item.resource_type}</small>
                      </span>
                      <span className="manager-status-pill pending">{workflowLabel(item.status, copy)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyBlock title={copy.noApprovals} />
              )}
              {canViewApprovals && <Link className="manager-panel-link" to="/manager/approvals">{copy.viewAll}<ArrowUpRight size={14} /></Link>}
            </section>

            <section className="panel manager-panel">
              <PanelHeading kicker={copy.upcomingAbsences} title={copy.upcomingAbsences} description={copy.dateRange} icon={<CalendarDays size={18} />} />
              {!canViewTeam ? (
                <EmptyBlock title={copy.noTeamAccess} />
              ) : upcomingLeaves.length ? (
                <div className="manager-absence-list">
                  {upcomingLeaves.map((leave) => (
                    <div className="manager-absence-row" key={leave.id}>
                      <span className="manager-absence-day">{new Date(`${leave.start}T00:00:00`).toLocaleDateString(language, { day: '2-digit', month: 'short' })}</span>
                      <span><strong>{leave.employee || `EMP-${leave.userId}`}</strong><small>{leave.type || copy.leave} · {leave.start} – {leave.end}</small></span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyBlock title={copy.noAbsences} />
              )}
              {canViewTeam && (
                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                  <Link to="/manager/leave" className="button secondary compact" style={{ width: '100%', justifyContent: 'center' }}>
                    <span>{copy.viewAll}</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              )}
            </section>

            <section className="panel manager-panel">
              <PanelHeading kicker={copy.recentActivity} title={copy.recentActivity} description={copy.teamActivityDescription} icon={<Clock3 size={18} />} />
              {!canViewApprovals ? (
                <EmptyBlock title={copy.noActivity} />
              ) : recentWorkflows.length ? (
                <div className="manager-activity-list">
                  {recentWorkflows.map((item) => (
                    <Link to={`/manager/workflows/${item.id}`} className="manager-activity-row" key={item.id}>
                      <span className={`manager-activity-dot ${item.status === 'approved' ? 'success' : item.status === 'pending_approval' ? 'pending' : ''}`} />
                      <span><strong>{item.version?.template?.name ?? item.resource_type}</strong><small>{item.initiator?.name ?? item.initiator_user_id} · {item.status.replaceAll('_', ' ')}</small></span>
                      <time>{workflowTimestamp(item) ? new Date(workflowTimestamp(item)).toLocaleDateString(language) : '—'}</time>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyBlock title={copy.noActivity} />
              )}
              {canViewApprovals && (
                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                  <Link to="/manager/workflows" className="button secondary compact" style={{ width: '100%', justifyContent: 'center' }}>
                    <span>{copy.viewAll}</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ icon, label, value, footnote, accent, to }: {
  icon: React.ReactNode
  label: string
  value: string
  footnote: string
  accent: string
  to?: string
}) {
  const card = (
    <article className={`manager-metric ${accent}`}>
      <span className="manager-metric-icon">{icon}</span>
      <span className="manager-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{footnote}</small>
    </article>
  )
  if (to) {
    return (
      <Link to={to} style={{ textDecoration: 'none', color: 'inherit', display: 'contents' }}>
        {card}
      </Link>
    )
  }
  return card
}

function PanelHeading({ kicker, title, description, icon }: {
  kicker: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="manager-panel-heading">
      <div><span>{kicker}</span><h2>{title}</h2><p>{description}</p></div>
      <span className="manager-panel-icon">{icon}</span>
    </div>
  )
}

function EmptyBlock({ title }: { title: string }) {
  return <div className="manager-empty"><span /><p>{title}</p></div>
}

function PersonAvatar({ employee }: { employee: Employee }) {
  return <span className="manager-avatar">{employee.initials || `${employee.firstName[0] ?? ''}${employee.lastName[0] ?? ''}`}</span>
}

function ManagerApiNotice({ message }: { message: string }) {
  return <div className="page manager-page"><div className="manager-api-notice">{message}</div></div>
}

export { ManagerApiNotice }
