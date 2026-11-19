import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, GitBranch, Inbox, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import {
  listWorkflowInstances,
  type WorkflowInstance,
  type WorkflowListFilters,
} from '../../data/apiWorkflowRepository'
import { isApiDataMode } from '../../lib/apiClient'
import { employeeDashboardTranslations } from './translations'
import type { EmployeeCopy } from './translations'
import '../workflow/WorkflowPage.css'
import './EmployeeWorkflowsPage.css'

type WorkflowTab = 'requests' | 'approvals'

function statusLabel(status: string, t: EmployeeCopy): string {
  const labels: Record<string, string> = {
    pending_approval: t.workflowStatusPending,
    returned_for_correction: t.workflowStatusReturned,
    approved: t.workflowStatusApproved,
    rejected: t.workflowStatusRejected,
    cancelled: t.workflowStatusCancelled,
  }
  return labels[status] ?? status
}

function titleFor(instance: WorkflowInstance): string {
  return instance.version?.template?.name ?? instance.resource_type
}

function pendingCount(instance: WorkflowInstance): number {
  return instance.steps?.reduce((count, step) => count + step.assignments.filter((assignment) =>
    assignment.status === 'pending' || assignment.status === 'queued',
  ).length, 0) ?? 0
}

function progress(instance: WorkflowInstance): { complete: number; total: number } {
  const assignments = instance.steps?.flatMap((step) => step.assignments) ?? []
  return {
    complete: assignments.filter((assignment) => assignment.status === 'approved').length,
    total: assignments.length,
  }
}

async function listAllWorkflowInstances(filters: WorkflowListFilters): Promise<WorkflowInstance[]> {
  const first = await listWorkflowInstances({ ...filters, page: 1, pageSize: 100 })
  const results = [...first.data]
  const pageCount = Math.ceil(first.total / first.pageSize)
  for (let page = 2; page <= pageCount; page += 1) {
    const next = await listWorkflowInstances({ ...filters, page, pageSize: 100 })
    results.push(...next.data)
  }
  return results
}

export function EmployeeWorkflowsPage() {
  const { hasPermission } = useAuth()
  const { language } = useI18n()
  const t = employeeDashboardTranslations[language]
  const canApprove = hasPermission('workflow.approve')
  const [tab, setTab] = useState<WorkflowTab>('requests')
  const [requests, setRequests] = useState<WorkflowInstance[]>([])
  const [approvals, setApprovals] = useState<WorkflowInstance[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    setLoading(true)
    setError('')
    const fetches = [
      listAllWorkflowInstances({ mine: true }),
      ...(canApprove ? [listAllWorkflowInstances({ assignedToMe: true, status: 'pending_approval' })] : []),
    ]
    Promise.all(fetches)
      .then(([own, assigned]) => {
        if (!active) return
        setRequests(own)
        setApprovals(assigned ?? [])
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : t.workflowLoadFailed)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [canApprove, reload, t.workflowLoadFailed])

  const rows = useMemo(() => tab === 'requests' ? requests : approvals, [approvals, requests, tab])

  if (!isApiDataMode) {
    return (
      <div className="page employee-workflows workflow-page">
        <PageHeader eyebrow={t.employeePortal} title={t.workflowsTitle} subtitle={t.workflowsSubtitle} />
        <div className="workflow-notice">{t.workflowApiRequired}</div>
      </div>
    )
  }

  return (
    <div className="page employee-workflows workflow-page">
      <PageHeader eyebrow={t.employeePortal} title={t.workflowsTitle} subtitle={t.workflowsSubtitle}>
        <div className="employee-workflow-header-actions">
          <Link className="button secondary" to="/employee/notifications"><Inbox size={15} />{t.notifications}</Link>
          <button type="button" className="button secondary" disabled={loading} onClick={() => setReload((value) => value + 1)}>
            <RefreshCw size={15} />{t.tryAgain}
          </button>
        </div>
      </PageHeader>

      <div className="workflow-tabs" role="tablist" aria-label={t.workflowsTitle}>
        <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
          {t.workflowRequestsTab}
        </button>
        {canApprove && (
          <button type="button" role="tab" aria-selected={tab === 'approvals'} className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}>
            {t.workflowApprovalsTab}
            {approvals.length > 0 && <span className="employee-workflow-count">{approvals.length}</span>}
          </button>
        )}
      </div>

      {error && <div className="workflow-alert error" role="alert">{error}</div>}
      {loading && <div className="workflow-loading" role="status"><span className="workflow-spinner" />{t.orgLoading}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="workflow-empty employee-workflow-empty">
          <GitBranch size={21} />
          <strong>{tab === 'requests' ? t.workflowNoRequests : t.workflowNoApprovals}</strong>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <section className="workflow-approval-list" aria-label={tab === 'requests' ? t.workflowRequestsTab : t.workflowApprovalsTab}>
          {rows.map((instance) => {
            const currentStep = instance.steps?.find((step) => step.status === 'active')
            const counts = progress(instance)
            const pending = pendingCount(instance)
            return (
              <Link className="workflow-row employee-workflow-row" key={instance.id} to={`/employee/workflows/${instance.id}`}>
                <span className="workflow-row-icon"><GitBranch size={18} /></span>
                <span className="workflow-row-main">
                  <strong>{titleFor(instance)}</strong>
                  <span>{instance.resource_type} · {instance.resource_id}</span>
                </span>
                <span className="employee-workflow-progress">
                  <span>{t.workflowCurrentStep}: {currentStep?.key ?? statusLabel(instance.status, t)}</span>
                  <span>{t.workflowProgress}: {counts.complete}/{counts.total} · {pending} {t.workflowPendingSteps}</span>
                </span>
                <span className={`workflow-pill ${instance.status === 'pending_approval' ? 'pending' : 'active'}`}>
                  {statusLabel(instance.status, t)}
                </span>
                {tab === 'approvals' && <span className="employee-workflow-action">{t.workflowActionRequired}</span>}
                <ArrowUpRight size={17} className="workflow-row-arrow" />
              </Link>
            )
          })}
        </section>
      )}
    </div>
  )
}
