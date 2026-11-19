import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, CheckCheck, Filter, GitBranch, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import {
  listVisibleDelegations,
  listVisibleWorkflows,
} from '../../data/managerDashboardRepository'
import type { WorkflowDelegation, WorkflowInstance, WorkflowListFilters } from '../../data/apiWorkflowRepository'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

type WorkflowStatus = 'pending_approval' | 'approved' | 'rejected' | 'returned_for_correction' | 'cancelled'

const statuses: WorkflowStatus[] = ['pending_approval', 'approved', 'rejected', 'returned_for_correction', 'cancelled']
const modules = [
  { value: 'leave', key: 'leave' },
  { value: 'onboarding', key: 'onboarding' },
  { value: 'offboarding', key: 'offboarding' },
] as const

function statusCopy(status: string, copy: (typeof managerTranslations)['en']): string {
  const labels: Record<string, string> = {
    pending_approval: copy.pending,
    approved: copy.approved,
    rejected: copy.rejected,
    returned_for_correction: copy.returned,
    cancelled: copy.cancelled,
  }
  return labels[status] ?? status
}

function activeDelegatedInstanceIds(delegations: WorkflowDelegation[], userId: string): Set<string> {
  const now = Date.now()
  return new Set(delegations
    .filter((item) => item.delegate_user_id === userId
      && !item.revoked_at
      && item.assignment?.status === 'pending'
      && item.assignment.step?.status === 'active'
      && item.assignment.step.instance?.status === 'pending_approval'
      && Date.parse(item.starts_at) <= now
      && Date.parse(item.ends_at) > now)
    .map((item) => item.assignment?.step?.instance?.id)
    .filter((id): id is string => Boolean(id)))
}

function involvedInApproval(instance: WorkflowInstance, userId: string, delegatedIds: Set<string>): boolean {
  return delegatedIds.has(instance.id)
    || instance.steps?.some((step) => step.assignments.some((assignment) => assignment.approver_user_id === userId)) === true
}

function buildFilters(module: string, status: string, submittedFrom: string, submittedTo: string): WorkflowListFilters {
  return {
    ...(module ? { module } : {}),
    ...(status ? { status } : {}),
    ...(status === 'pending_approval' ? { assignedToMe: true } : {}),
    ...(submittedFrom ? { submittedFrom } : {}),
    ...(submittedTo ? { submittedTo } : {}),
  }
}

export function ManagerApprovalCenterPage() {
  const { currentUser, hasPermission } = useAuth()
  const { language, text } = useI18n()
  const copy = managerTranslations[language]
  const [module, setModule] = useState('')
  const [status, setStatus] = useState('pending_approval')
  const [submittedFrom, setSubmittedFrom] = useState('')
  const [submittedTo, setSubmittedTo] = useState('')
  const [instances, setInstances] = useState<WorkflowInstance[]>([])
  const [delegations, setDelegations] = useState<WorkflowDelegation[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const currentUserId = String(currentUser?.id ?? '')

  const filters = useMemo(
    () => buildFilters(module, status, submittedFrom, submittedTo),
    [module, status, submittedFrom, submittedTo],
  )
  const canApprove = hasPermission('workflow.approve')

  const load = useCallback(async () => {
    if (!isApiDataMode || !canApprove) return
    setLoading(true)
    setError('')
    try {
      const [workflowItems, delegationItems] = await Promise.all([
        listVisibleWorkflows(filters),
        listVisibleDelegations(),
      ])
      setInstances(workflowItems)
      setDelegations(delegationItems)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canApprove, copy.loadError, filters])

  useEffect(() => { void load() }, [load, refreshKey])

  const delegatedIds = useMemo(
    () => activeDelegatedInstanceIds(delegations, currentUserId),
    [currentUserId, delegations],
  )
  const approvalItems = useMemo(
    () => instances.filter((item) => involvedInApproval(item, currentUserId, delegatedIds)),
    [currentUserId, delegatedIds, instances],
  )
  const statusLabels: Record<WorkflowStatus, string> = {
    pending_approval: copy.pending,
    approved: copy.approved,
    rejected: copy.rejected,
    returned_for_correction: copy.returned,
    cancelled: copy.cancelled,
  }

  if (!isApiDataMode) return <ManagerApiNotice message={copy.apiRequired} />

  return (
    <div className="page manager-page">
      <PageHeader eyebrow={copy.approvals} title={copy.approvalInbox} subtitle={copy.approvalDescription}>
        <button type="button" className="button secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <RefreshCw size={15} />{text('Refresh')}
        </button>
      </PageHeader>

      {!canApprove ? (
        <div className="manager-api-notice">{copy.noApprovals}</div>
      ) : (
        <>
          <section className="manager-approval-summary">
            <div className="manager-approval-summary-icon"><CheckCheck size={19} /></div>
            <div><span>{copy.approvals}</span><strong>{loading ? '—' : approvalItems.length}</strong><small>{copy.approvalDescription}</small></div>
            <GitBranch size={21} />
          </section>

          <section className="manager-filter-panel">
            <div className="manager-filter-title"><Filter size={16} /><strong>{copy.filters}</strong></div>
            <label><span>{copy.module}</span>
              <select value={module} onChange={(event) => setModule(event.target.value)}>
                <option value="">{copy.allModules}</option>
                {modules.map((item) => <option key={item.value} value={item.value}>{copy[item.key]}</option>)}
              </select>
            </label>
            <label><span>{copy.status}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">{copy.allStatuses}</option>
                {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
              </select>
            </label>
            <label><span>{copy.from}</span><input type="date" value={submittedFrom} max={submittedTo || undefined} onChange={(event) => setSubmittedFrom(event.target.value)} /></label>
            <label><span>{copy.to}</span><input type="date" value={submittedTo} min={submittedFrom || undefined} onChange={(event) => setSubmittedTo(event.target.value)} /></label>
          </section>

          {error && <div className="manager-alert" role="alert"><span>{error}</span><button type="button" className="button secondary" onClick={() => setRefreshKey((value) => value + 1)}>{copy.retry}</button></div>}
          {loading ? <div className="manager-loading" role="status"><span className="manager-spinner" />{copy.loading}</div> : null}
          {!loading && !error && approvalItems.length ? (
            <section className="manager-approval-table" aria-label={copy.approvalInbox}>
              <div className="manager-approval-table-head">
                <span>{copy.request}</span><span>{copy.requester}</span><span>{copy.currentStep}</span><span>{copy.submitted}</span><span>{copy.status}</span><span />
              </div>
              {approvalItems.map((item) => {
                const currentStep = item.steps?.find((step) => step.status === 'active')
                const isDelegated = delegatedIds.has(item.id)
                return (
                  <Link to={`/manager/workflows/${item.id}`} className="manager-approval-table-row" key={item.id}>
                    <span className="manager-request-title"><strong>{item.version?.template?.name ?? item.resource_type}</strong><small>{item.resource_type} · {item.resource_id}</small></span>
                    <span>{item.initiator?.name ?? item.initiator_user_id}</span>
                    <span>{currentStep?.key ?? '—'}{isDelegated && <em className="manager-delegated-tag">{copy.delegated}</em>}</span>
                    <span>{item.submitted_at ? new Date(item.submitted_at).toLocaleDateString(language) : '—'}</span>
                    <span className={`manager-status-pill ${item.status === 'pending_approval' ? 'pending' : 'quiet'}`}>{statusCopy(item.status, copy)}</span>
                    <ArrowUpRight size={16} />
                  </Link>
                )
              })}
            </section>
          ) : !loading && !error ? (
            <div className="manager-empty large-empty"><span /><p>{copy.noApprovals}</p></div>
          ) : null}

          <p className="manager-approval-footnote"><CalendarDays size={14} />{copy.approvalDescription}</p>
        </>
      )}
    </div>
  )
}
