import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  CalendarCheck2,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import { listVisibleLeaveRequests } from '../../data/managerDashboardRepository'
import type { LeaveRequest, LeaveStatus } from '../../types/models'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

type LeaveTab = 'requests' | 'absences'

export function ManagerLeavePage() {
  const { currentUser, hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = managerTranslations[language]
  const managerId = Number(currentUser?.employeeId)
  const hasEmployeeLink = Number.isSafeInteger(managerId) && managerId > 0
  const canViewTeam =
    hasPermission('people.employee.view.all') ||
    hasPermission('people.employee.view.department')

  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(isApiDataMode && canViewTeam)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<LeaveTab>('requests')

  const loadRequests = useCallback(async () => {
    if (!isApiDataMode || !canViewTeam) return
    setLoading(true)
    setError('')
    try {
      const data = await listVisibleLeaveRequests()
      setRequests(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canViewTeam, copy.loadError])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return requests.filter((req) => {
      const matchesStatus = statusFilter === 'all' || req.status === statusFilter
      const matchesSearch =
        !term ||
        req.employee.toLowerCase().includes(term) ||
        req.type.toLowerCase().includes(term) ||
        req.note.toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [requests, statusFilter, searchTerm])

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const upcomingAbsences = useMemo(() => {
    return requests
      .filter((r) => r.status === 'approved' && r.end >= todayStr)
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [requests, todayStr])

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending').length
    const approved = requests.filter((r) => r.status === 'approved').length
    const rejected = requests.filter((r) => r.status === 'rejected').length
    return { total: requests.length, pending, approved, rejected }
  }, [requests])

  const statusLabel = (status: string) =>
    status === 'pending'
      ? copy.pending
      : status === 'approved'
        ? copy.approved
        : status === 'rejected'
          ? copy.rejected
          : status

  if (!canViewTeam) {
    return (
      <div className="page manager-page">
        <PageHeader eyebrow={copy.portal} title={copy.leaveManagement} subtitle={copy.leaveManagementSubtitle} />
        <div className="manager-error-banner" role="alert">{copy.noTeamAccess}</div>
      </div>
    )
  }

  if (!isApiDataMode) return <ManagerApiNotice message={copy.apiRequired} />

  return (
    <div className="page manager-page">
      <Breadcrumb
        items={[
          { label: copy.portal, path: '/manager/dashboard' },
          { label: copy.leaveManagement },
        ]}
      />

      <PageHeader
        eyebrow={copy.portal}
        title={copy.leaveManagement}
        subtitle={copy.leaveManagementSubtitle}
      />

      {!hasEmployeeLink && (
        <div className="manager-notice-banner">
          <Info size={16} aria-hidden="true" />
          <span>{copy.teamUnavailable}</span>
        </div>
      )}

      <div className="manager-notice-banner">
        <Info size={16} aria-hidden="true" />
        <span>{copy.readOnlyNotice}</span>
      </div>

      <div className="manager-kpi-grid">
        <div className="manager-kpi-card">
          <div className="manager-kpi-icon blue" aria-hidden="true">
            <CalendarDays size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.request}</span>
            <strong className="manager-kpi-value">{stats.total}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon orange" aria-hidden="true">
            <Clock size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.pendingApprovals}</span>
            <strong className="manager-kpi-value">{stats.pending}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon mint" aria-hidden="true">
            <CheckCircle2 size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.approved}</span>
            <strong className="manager-kpi-value">{stats.approved}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon purple" aria-hidden="true">
            <CalendarCheck2 size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.upcomingAbsences}</span>
            <strong className="manager-kpi-value">{upcomingAbsences.length}</strong>
          </div>
        </div>
      </div>

      <div className="manager-tabs-bar" role="tablist" aria-label={copy.leaveManagement}>
        <button
          type="button"
          role="tab"
          id="manager-leave-tab-requests"
          aria-selected={activeTab === 'requests'}
          aria-controls="manager-leave-panel"
          className={`manager-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span>{copy.request}</span>
          <span className="manager-tab-badge">{requests.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="manager-leave-tab-absences"
          aria-selected={activeTab === 'absences'}
          aria-controls="manager-leave-panel"
          className={`manager-tab-btn ${activeTab === 'absences' ? 'active' : ''}`}
          onClick={() => setActiveTab('absences')}
        >
          <CalendarCheck2 size={16} aria-hidden="true" />
          <span>{copy.teamAbsences}</span>
          <span className="manager-tab-badge">{upcomingAbsences.length}</span>
        </button>
      </div>

      <section
        className="manager-section"
        id="manager-leave-panel"
        role="tabpanel"
        aria-labelledby={`manager-leave-tab-${activeTab}`}
      >
        {activeTab === 'requests' && (
          <div className="manager-filter-bar">
            <div className="manager-search-box">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                aria-label={copy.searchTeam}
                placeholder={copy.searchTeam}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="manager-status-pills" role="group" aria-label={copy.status}>
              {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  aria-pressed={statusFilter === st}
                  className={`manager-filter-pill ${statusFilter === st ? 'active' : ''}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'all' ? copy.all : statusLabel(st)}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="manager-loading-state" role="status">{copy.loading}</div>
        ) : error ? (
          <div className="manager-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadRequests()}>
              {copy.retry}
            </button>
          </div>
        ) : activeTab === 'requests' ? (
          filteredRequests.length === 0 ? (
            <div className="manager-empty-state">
              <CalendarDays size={32} aria-hidden="true" />
              <p>{copy.noLeaveRequests}</p>
            </div>
          ) : (
            <div className="manager-table-wrapper">
              <table className="manager-table wide">
                <thead>
                  <tr>
                    <th>{copy.requester}</th>
                    <th>{copy.leaveType}</th>
                    <th>{copy.dateRange}</th>
                    <th>{copy.duration}</th>
                    <th>{copy.backup}</th>
                    <th>{copy.note}</th>
                    <th>{copy.status}</th>
                    <th>{copy.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        <strong>{req.employee}</strong>
                      </td>
                      <td>
                        <span className="manager-type-badge">{req.type || 'Annual'}</span>
                      </td>
                      <td>
                        <div className="manager-cell-dates">
                          <span>{req.start}</span>
                          <span className="manager-date-arrow" aria-hidden="true">→</span>
                          <span>{req.end}</span>
                        </div>
                      </td>
                      <td>
                        {req.duration} {copy.days}
                      </td>
                      <td>{req.backup || '—'}</td>
                      <td>
                        <span className="manager-cell-note" title={req.note}>
                          {req.note || '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`manager-status-badge ${req.status}`}>
                          {statusLabel(req.status)}
                        </span>
                      </td>
                      <td>
                        {req.status === 'pending' ? (
                          <Link to="/manager/approvals" className="button primary compact">
                            <span>{copy.reviewAndDecide}</span>
                            <ExternalLink size={14} aria-hidden="true" />
                          </Link>
                        ) : (
                          <Link to="/manager/workflows" className="button secondary compact">
                            <span>{copy.viewDetails}</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : upcomingAbsences.length === 0 ? (
          <div className="manager-empty-state">
            <CalendarCheck2 size={32} aria-hidden="true" />
            <p>{copy.noAbsences}</p>
          </div>
        ) : (
          <div className="manager-cards-grid">
            {upcomingAbsences.map((absence) => (
              <div key={absence.id} className="manager-card">
                <div className="manager-card-header">
                  <div>
                    <strong>{absence.employee}</strong>
                    <span className="manager-card-sub">{absence.type || 'Leave'}</span>
                  </div>
                  <span className="manager-status-badge approved">{copy.approved}</span>
                </div>
                <div className="manager-card-body">
                  <div className="manager-card-row">
                    <span className="manager-label">{copy.from}</span>
                    <strong>{absence.start}</strong>
                  </div>
                  <div className="manager-card-row">
                    <span className="manager-label">{copy.to}</span>
                    <strong>{absence.end}</strong>
                  </div>
                  <div className="manager-card-row">
                    <span className="manager-label">{copy.duration}</span>
                    <span>
                      {absence.duration} {copy.days}
                    </span>
                  </div>
                  {absence.backup && (
                    <div className="manager-card-row">
                      <span className="manager-label">{copy.backup}</span>
                      <span>{absence.backup}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}