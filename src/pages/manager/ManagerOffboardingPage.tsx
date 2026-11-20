import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UserMinus,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Calendar,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import { listVisibleOffboarding } from '../../data/managerDashboardRepository'
import type { OffboardingRequest, RequestStatus } from '../../types/models'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

export function ManagerOffboardingPage() {
  const { currentUser, hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = managerTranslations[language]
  const managerId = Number(currentUser?.employeeId)
  const hasEmployeeLink = Number.isSafeInteger(managerId) && managerId > 0
  const canViewTeam =
    hasPermission('people.employee.view.all') ||
    hasPermission('people.employee.view.department')

  const [cases, setCases] = useState<OffboardingRequest[]>([])
  const [loading, setLoading] = useState(isApiDataMode && canViewTeam)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const loadCases = useCallback(async () => {
    if (!isApiDataMode || !canViewTeam) return
    setLoading(true)
    setError('')
    try {
      const data = await listVisibleOffboarding()
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
        c.reason.toLowerCase().includes(term) ||
        c.replacement.toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [cases, statusFilter, searchTerm])

  const stats = useMemo(() => {
    const pending = cases.filter(
      (c) => c.approvalStatus === 'pending_approval' || c.stage === 'Pending',
    ).length
    const onTrack = cases.filter((c) => c.status === 'On track').length
    const completed = cases.filter((c) => c.status === 'Completed').length
    return { total: cases.length, pending, onTrack, completed }
  }, [cases])

  if (!canViewTeam) {
    return (
      <div className="page manager-page">
        <PageHeader eyebrow={copy.portal} title={copy.offboardingManagement} subtitle={copy.offboardingManagementSubtitle} />
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
          { label: copy.offboarding },
        ]}
      />

      <PageHeader
        eyebrow={copy.portal}
        title={copy.offboardingManagement}
        subtitle={copy.offboardingManagementSubtitle}
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
            <UserMinus size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.offboarding}</span>
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
            {(['all', 'On track', 'Completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={statusFilter === st}
                className={`manager-filter-pill ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all' ? copy.all : st === 'On track' ? copy.onTrack : copy.completed}
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
            <UserMinus size={32} aria-hidden="true" />
            <p>{copy.noOffboarding}</p>
          </div>
        ) : (
          <div className="manager-cases-list">
            {filteredCases.map((item) => {
              const isPendingManager =
                item.approvalStatus === 'pending_approval' || item.stage === 'Pending'
              const isCompleted = item.status === 'Completed'
              const progress = Math.min(100, Math.max(0, item.progress))

              return (
                <div key={item.id} className="manager-case-card">
                  <div className="manager-case-header">
                    <div className="manager-case-meta">
                      <div className="manager-case-avatar" aria-hidden="true">
                        <UserMinus size={18} />
                      </div>
                      <div>
                        <div className="manager-case-title">
                          <strong>{item.employee}</strong>
                        </div>
                        <small className="manager-card-sub">
                          <Calendar size={12} className="manager-inline-icon" aria-hidden="true" />
                          {copy.exitDate}: {item.exitDate}
                        </small>
                      </div>
                    </div>

                    <div className="manager-case-badges">
                      <span className={`manager-status-badge ${isCompleted ? 'approved' : 'info'}`}>
                        {item.status}
                      </span>
                      {item.approvalStatus && (
                        <span className={`manager-status-badge ${item.approvalStatus}`}>
                          {item.approvalStatus.replaceAll('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="manager-case-info-grid">
                    <div>
                      <span className="manager-label">{copy.reason}</span>
                      <strong>{item.reason || '—'}</strong>
                    </div>
                    <div>
                      <span className="manager-label">{copy.replacement}</span>
                      <strong>{item.replacement || '—'}</strong>
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
                        className={`manager-progress-bar ${isCompleted ? 'success' : ''}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="manager-case-footer">
                    <span />
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
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}