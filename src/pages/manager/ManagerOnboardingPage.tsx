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
    return cases.filter((c) => {
      const matchesStatus =
        statusFilter === 'all' || c.status === statusFilter
      const term = searchTerm.trim().toLowerCase()
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
      <div className="manager-page">
        <PageHeader eyebrow={copy.portal} title={copy.onboardingManagement} subtitle={copy.onboardingManagementSubtitle} />
        <div className="manager-error-banner">{copy.noTeamAccess}</div>
      </div>
    )
  }

  if (!isApiDataMode) return <ManagerApiNotice message={copy.apiRequired} />

  return (
    <div className="manager-page">
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
        <div className="manager-notice-banner" style={{ marginBottom: 16 }}>
          <Info size={16} />
          <span>{copy.teamUnavailable}</span>
        </div>
      )}

      <div className="manager-notice-banner">
        <Info size={16} />
        <span>{copy.readOnlyNotice}</span>
      </div>

      <div className="manager-kpi-grid">
        <div className="manager-kpi-card">
          <div className="manager-kpi-icon blue">
            <UserPlus size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.onboarding}</span>
            <strong className="manager-kpi-value">{stats.total}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon orange">
            <Clock size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.pendingApprovals}</span>
            <strong className="manager-kpi-value">{stats.pending}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon mint">
            <CheckCircle2 size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.onTrack}</span>
            <strong className="manager-kpi-value">{stats.onTrack}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon purple">
            <CheckCircle2 size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.completed}</span>
            <strong className="manager-kpi-value">{stats.completed}</strong>
          </div>
        </div>
      <section className="manager-section">
        <div className="manager-filter-bar">
          <div className="manager-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder={copy.searchTeam}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="manager-status-pills">
            {(['all', 'On track', 'At risk', 'Completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
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
          <div className="manager-loading-state">{copy.loading}</div>
        ) : error ? (
          <div className="manager-error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => void loadCases()}>
              {copy.retry}
            </button>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="manager-empty-state">
            <UserPlus size={32} />
            <p>{copy.noOnboarding}</p>
          </div>
        ) : (
          <div className="manager-cases-list">
            {filteredCases.map((item) => {
              const isExpanded = expandedId === item.id
              const isPendingManager =
                item.approvalStatus === 'pending_approval' ||
                item.stage === 'Manager Approval'

              return (
                <div key={item.id} className="manager-case-card">
                  <div className="manager-case-header">
                    <div className="manager-case-meta">
                      <div className="manager-case-avatar">
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
                      <span className={`manager-status-badge ${item.status === 'On track' ? 'approved' : item.status === 'Completed' ? 'mint' : 'pending'}`}>
                        {item.status}
                      </span>
                      {item.approvalStatus && (
                        <span className={`manager-status-badge ${item.approvalStatus}`}>
                          {item.approvalStatus.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="manager-case-progress-wrap">
                    <div className="manager-progress-labels">
                      <span>{copy.stage}: <strong>{item.stage}</strong></span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="manager-progress-track">
                      <div
                        className="manager-progress-bar"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="manager-case-footer">
                    <button
                      type="button"
                      className="manager-expand-btn"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <span>{copy.tasks} ({item.employeeTasks.length})</span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    <div className="manager-case-actions">
                      {isPendingManager ? (
                        <Link
                          to="/manager/approvals"
                          className="button primary compact"
                        >
                          <span>{copy.reviewAndDecide}</span>
                          <ExternalLink size={14} />
                        </Link>
                      ) : (
                        <Link
                          to="/manager/workflows"
                          className="button secondary compact"
                        >
                          <span>{copy.viewDetails}</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="manager-tasks-panel">
                      {item.employeeTasks.length === 0 ? (
                        <small className="manager-card-sub">{copy.noActivity}</small>
                      ) : (
                        <ul className="manager-task-list">
                          {item.employeeTasks.map((t) => (
                            <li key={t.id} className={`manager-task-item ${t.done ? 'done' : ''}`}>
                              {t.done ? (
                                <CheckCircle2 size={16} className="task-done-icon" />
                              ) : (
                                <AlertTriangle size={16} className="task-pending-icon" />
                              )}
                              <span>{t.labelKey.replaceAll('_', ' ')}</span>
                              {t.dueDate && (
                                <small className="manager-card-sub">
                                  {copy.to}: {t.dueDate}
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
    </div>
  )
}
