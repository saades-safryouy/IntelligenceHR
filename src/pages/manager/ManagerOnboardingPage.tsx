import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UserPlus,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import { listVisibleOnboarding } from '../../data/managerDashboardRepository'
import type { OnboardingRequest, RequestStatus } from '../../types/models'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

export function ManagerOnboardingPage() {
  const { currentUser, hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = managerTranslations[language]
  const managerId = Number(currentUser?.employeeId)
  const hasEmployeeLink = Number.isSafeInteger(managerId) && managerId > 0
  const canViewTeam =
    hasPermission('people.employee.view.all') ||
    hasPermission('people.employee.view.department')

  const [cases, setCases] = useState<OnboardingRequest[]>([])
  const [loading, setLoading] = useState(isApiDataMode && canViewTeam)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadCases = useCallback(async () => {
    if (!isApiDataMode || !canViewTeam) return
    setLoading(true)
    setError('')
    try {
      const data = await listVisibleOnboarding()
      setCases(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canViewTeam, copy.loadError])

  useEffect(() => {
    void loadCases()
  }, [loadCases])

  const filteredCases = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return cases.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      const matchesSearch =
        !term ||
        c.employee.toLowerCase().includes(term) ||
        c.position.toLowerCase().includes(term) ||
        c.department.toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [cases, statusFilter, searchTerm])

  const stats = useMemo(() => {
    const pending = cases.filter(
      (c) => c.approvalStatus === 'pending_approval' || c.stage === 'Manager Approval',
    ).length
    const onTrack = cases.filter((c) => c.status === 'On track').length
    const completed = cases.filter((c) => c.status === 'Completed').length
    return { total: cases.length, pending, onTrack, completed }
  }, [cases])

  if (!canViewTeam) {
    return (
      <div className="page manager-page">
        <PageHeader eyebrow={copy.portal} title={copy.onboardingManagement} subtitle={copy.onboardingManagementSubtitle} />
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
          { label: copy.onboarding },
        ]}
      />

      <PageHeader
        eyebrow={copy.portal}
        title={copy.onboardingManagement}
        subtitle={copy.onboardingManagementSubtitle}
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
            <UserPlus size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.onboarding}</span>
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
            <span className="manager-kpi-label">{copy.onTrack}</span>
            <strong className="manager-kpi-value">{stats.onTrack}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon purple" aria-hidden="true">
            <CheckCircle2 size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.completed}</span>
            <strong className="manager-kpi-value">{stats.completed}</strong>
          </div>
        </div>
      </div>

      <section className="manager-section">
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
            {(['all', 'On track', 'At risk', 'Completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={statusFilter === st}
                className={`manager-filter-pill ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all'
                  ? copy.all
                  : st === 'On track'
                    ? copy.onTrack
                    : st === 'At risk'
                      ? copy.atRisk
                      : copy.completed}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="manager-loading-state" role="status">{copy.loading}</div>
        ) : error ? (
          <div className="manager-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadCases()}>
              {copy.retry}
            </button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="manager-empty-state">
            <UserPlus size={32} aria-hidden="true" />
            <p>{copy.noOnboarding}</p>
          </div>
        ) : (
          <div className="manager-cases-list">
            {filteredCases.map((item) => {
              const isExpanded = expandedId === item.id
              const isPendingManager =
                item.approvalStatus === 'pending_approval' || item.stage === 'Manager Approval'
              const statusTone =
                item.status === 'Completed' ? 'approved' : item.status === 'On track' ? 'info' : 'pending'
              const progressTone =
                item.status === 'Completed' ? 'success' : item.status === 'At risk' ? 'warning' : ''
              const progress = Math.min(100, Math.max(0, item.progress))
              const tasksId = `manager-onboarding-tasks-${item.id}`

              return (
                <div key={item.id} className="manager-case-card">
                  <div className="manager-case-header">
                    <div className="manager-case-meta">
                      <div className="manager-case-avatar" aria-hidden="true">
                        <UserPlus size={18} />
                      </div>
                      <div>
                        <div className="manager-case-title">
                          <strong>{item.employee}</strong>
                          <span className="manager-case-dept">
                            {item.position} · {item.department}
                          </span>
                        </div>
                        <small className="manager-card-sub">
                          {copy.from}: {item.startDate}
                        </small>
                      </div>
                    </div>

                    <div className="manager-case-badges">
                      <span className={`manager-status-badge ${statusTone}`}>{item.status}</span>
                      {item.approvalStatus && (
                        <span className={`manager-status-badge ${item.approvalStatus}`}>
                          {item.approvalStatus.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="manager-case-progress-wrap">
                    <div className="manager-progress-labels">
                      <span>
                        {copy.stage}: <strong>{item.stage}</strong>
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div
                      className="manager-progress-track"
                      role="progressbar"
                      aria-label={`${item.employee}: ${copy.stage}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <div
                        className={`manager-progress-bar ${progressTone}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="manager-case-footer">
                    <button
                      type="button"
                      className="manager-expand-btn"
                      aria-expanded={isExpanded}
                      aria-controls={tasksId}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <span>
                        {copy.tasks} ({item.employeeTasks.length})
                      </span>
                      {isExpanded ? (
                        <ChevronUp size={16} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={16} aria-hidden="true" />
                      )}
                    </button>

                    <div className="manager-case-actions">
                      {isPendingManager ? (
                        <Link to="/manager/approvals" className="button primary compact">
                          <span>{copy.reviewAndDecide}</span>
                          <ExternalLink size={14} aria-hidden="true" />
                        </Link>
                      ) : (
                        <Link to="/manager/workflows" className="button secondary compact">
                          <span>{copy.viewDetails}</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="manager-tasks-panel" id={tasksId}>
                      {item.employeeTasks.length === 0 ? (
                        <small className="manager-card-sub">{copy.noActivity}</small>
                      ) : (
                        <ul className="manager-task-list">
                          {item.employeeTasks.map((task) => (
                            <li
                              key={task.id}
                              className={`manager-task-item ${task.done ? 'done' : ''}`}
                            >
                              {task.done ? (
                                <CheckCircle2 size={16} className="task-done-icon" aria-hidden="true" />
                              ) : (
                                <AlertTriangle size={16} className="task-pending-icon" aria-hidden="true" />
                              )}
                              <span>{task.labelKey.replaceAll('_', ' ')}</span>
                              {task.dueDate && (
                                <small className="manager-card-sub">
                                  {copy.to}: {task.dueDate}
                                </small>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}