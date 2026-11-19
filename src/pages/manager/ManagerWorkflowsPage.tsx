import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GitBranch,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import { listVisibleWorkflows } from '../../data/managerDashboardRepository'
import type { WorkflowInstance } from '../../data/apiWorkflowRepository'
import { managerTranslations } from './translations'
import './ManagerDashboard.css'

export function ManagerWorkflowsPage() {
  const { hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = managerTranslations[language]
  const canApprove = hasPermission('workflow.approve')
  const canViewWorkflows =
    hasPermission('workflow.instance.view') ||
    hasPermission('workflow.instance.view.all') ||
    canApprove

  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([])
  const [loading, setLoading] = useState(isApiDataMode && canViewWorkflows)
  const [error, setError] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'assigned' | 'mine'>('all')
  const [moduleFilter, setModuleFilter] = useState<'all' | 'leave' | 'onboarding' | 'offboarding'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const loadWorkflows = useCallback(async () => {
    if (!isApiDataMode || !canViewWorkflows) return
    setLoading(true)
    setError('')
    try {
      const data = await listVisibleWorkflows({
        team: scopeFilter === 'all' ? true : undefined,
        assignedToMe: scopeFilter === 'assigned' ? true : undefined,
        mine: scopeFilter === 'mine' ? true : undefined,
        module: moduleFilter === 'all' ? undefined : moduleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setWorkflows(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canViewWorkflows, scopeFilter, moduleFilter, statusFilter, copy.loadError])

  useEffect(() => {
    void loadWorkflows()
  }, [loadWorkflows])

  const filteredWorkflows = useMemo(() => {
    if (!searchTerm.trim()) return workflows
    const term = searchTerm.trim().toLowerCase()
    return workflows.filter((w) => {
      const res = (w.resource_type || '').toLowerCase()
      const status = (w.status || '').toLowerCase()
      const id = (w.id || '').toLowerCase()
      return res.includes(term) || status.includes(term) || id.includes(term)
    })
  }, [workflows, searchTerm])

  const stats = useMemo(() => {
    const pending = workflows.filter((w) => w.status === 'pending_approval').length
    const approved = workflows.filter((w) => w.status === 'approved').length
    const returned = workflows.filter(
      (w) => w.status === 'returned_for_correction' || w.status === 'rejected',
    ).length
    return { total: workflows.length, pending, approved, returned }
  }, [workflows])

  if (!canViewWorkflows) {
    return (
      <div className="manager-page">
        <PageHeader eyebrow={copy.portal} title={copy.workflowsManagement} subtitle={copy.workflowsManagementSubtitle} />
        <div className="manager-error-banner">{copy.noTeamAccess}</div>
      </div>
    )
  }

  return (
    <div className="manager-page">
      <Breadcrumb
        items={[
          { label: copy.portal, path: '/manager/dashboard' },
          { label: copy.workflows },
        ]}
      />

      <PageHeader
        eyebrow={copy.portal}
        title={copy.workflowsManagement}
        subtitle={copy.workflowsManagementSubtitle}
      />

      <div className="manager-notice-banner">
        <Info size={16} />
        <span>{copy.approvalDescription}</span>
      </div>

      <div className="manager-kpi-grid">
        <div className="manager-kpi-card">
          <div className="manager-kpi-icon blue">
            <GitBranch size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.workflows}</span>
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
            <span className="manager-kpi-label">{copy.approved}</span>
            <strong className="manager-kpi-value">{stats.approved}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon purple">
            <AlertCircle size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.returned} / {copy.rejected}</span>
            <strong className="manager-kpi-value">{stats.returned}</strong>
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
            {(['all', 'assigned', 'mine'] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                className={`manager-filter-pill ${scopeFilter === sc ? 'active' : ''}`}
                onClick={() => setScopeFilter(sc)}
              >
                {sc === 'all'
                  ? copy.teamWorkflows
                  : sc === 'assigned'
                    ? copy.assignedToMe
                    : copy.initiatedByMe}
              </button>
            ))}
          </div>

          <div className="manager-status-pills">
            {(['all', 'leave', 'onboarding', 'offboarding'] as const).map((mod) => (
              <button
                key={mod}
                type="button"
                className={`manager-filter-pill ${moduleFilter === mod ? 'active' : ''}`}
                onClick={() => setModuleFilter(mod)}
              >
                {mod === 'all'
                  ? copy.allModules
                  : mod === 'leave'
                    ? copy.leave
                    : mod === 'onboarding'
                      ? copy.onboarding
                      : copy.offboarding}
              </button>
            ))}
          </div>
        </div>
          <div className="manager-status-pills">
            {(['all', 'pending_approval', 'approved', 'rejected'] as const).map((st) => (
              <button
                key={st}
                type="button"
                className={`manager-filter-pill ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                {st === 'all'
                  ? copy.all
                  : st === 'pending_approval'
                    ? copy.pending
                    : st === 'approved'
                      ? copy.approved
                      : copy.rejected}
              </button>
            ))}
          </div>

        {loading ? (
          <div className="manager-loading-state">{copy.loading}</div>
        ) : error ? (
          <div className="manager-error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => void loadWorkflows()}>
              {copy.retry}
            </button>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="manager-empty-state">
            <GitBranch size={32} />
            <p>{copy.noWorkflows}</p>
          </div>
        ) : (
          <div className="manager-table-wrapper">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>{copy.request}</th>
                  <th>{copy.module}</th>
                  <th>{copy.submitted}</th>
                  <th>{copy.status}</th>
                  <th>{copy.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((w) => {
                  const modName = (w.resource_type || '').replace('_case', '').replace('_request', '')
                  const isPending = w.status === 'pending_approval'

                  return (
                    <tr key={w.id}>
                      <td>
                        <div>
                          <strong>{w.resource_type ? w.resource_type.replaceAll('_', ' ') : copy.request}</strong>
                          <small className="manager-card-sub" style={{ display: 'block' }}>
                            ID: {w.resource_id ? `${w.resource_id.slice(0, 13)}…` : w.id.slice(0, 13)}
                          </small>
                        </div>
                      </td>
                      <td>
                        <span className="manager-type-badge">
                          {modName || copy.module}
                        </span>
                      </td>
                      <td>
                        <div className="manager-cell-dates">
                          <Calendar size={14} />
                          <span>{w.submitted_at ? w.submitted_at.slice(0, 10) : '—'}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`manager-status-badge ${w.status || 'pending'}`}>
                          {w.status ? w.status.replaceAll('_', ' ') : copy.pending}
                        </span>
                      </td>
                      <td>
                        <div className="manager-row-actions">
                          {isPending && canApprove ? (
                            <Link
                              to={`/manager/workflows/${w.id}`}
                              className="button primary compact"
                            >
                              <span>{copy.decideNow}</span>
                              <ExternalLink size={14} />
                            </Link>
                          ) : (
                            <Link
                              to={`/manager/workflows/${w.id}`}
                              className="button secondary compact"
                            >
                              <span>{copy.viewDetails}</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
    </div>
  )
}
