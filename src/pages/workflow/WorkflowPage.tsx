import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, Check, Clock3, FilePlus2, GitBranch, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import { isApiDataMode } from '../../lib/apiClient'
import {
  createWorkflowTemplate,
  createWorkflowVersion,
  listWorkflowDelegations,
  listWorkflowInstances,
  listWorkflowTemplates,
  publishWorkflowVersion,
  revokeWorkflowDelegation,
  type WorkflowDelegation,
  type WorkflowInstance,
  type WorkflowTemplate,
} from '../../data/apiWorkflowRepository'
import './WorkflowPage.css'

type WorkflowTab = 'approvals' | 'history' | 'delegations' | 'administration'

const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const DEFAULT_STEPS_JSON = `[
  {
    "key": "manager-review",
    "sequence": 1,
    "groupKey": "manager",
    "mode": "sequential",
    "completionRule": "all",
    "approverRule": { "type": "manager_chain", "levels": 1 }
  }
]`

function statusLabel(status: string, text: (key: string) => string): string {
  const labels: Record<string, string> = {
    pending_approval: 'Pending approval',
    returned_for_correction: 'Returned for correction',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  }
  return text(labels[status] ?? status)
}

export function WorkflowPage() {
  const { currentUser, hasPermission } = useAuth()
  const { text } = useI18n()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<WorkflowTab>(() => (
    searchParams.has('resourceId') && searchParams.has('resourceType') ? 'history' : 'approvals'
  ))
  const [approvals, setApprovals] = useState<WorkflowInstance[]>([])
  const [history, setHistory] = useState<WorkflowInstance[]>([])
  const [delegations, setDelegations] = useState<WorkflowDelegation[]>([])
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [templateForm, setTemplateForm] = useState({ key: '', name: '', module: '', resourceType: '' })
  const [versionTemplateId, setVersionTemplateId] = useState('')
  const [stepsJson, setStepsJson] = useState(DEFAULT_STEPS_JSON)

  const tabs = useMemo(() => {
    const available: WorkflowTab[] = []
    if (hasPermission('workflow.approve')) available.push('approvals')
    if (hasPermission('workflow.history.view') && (
      hasPermission('workflow.instance.view') || hasPermission('workflow.instance.view.all') || hasPermission('workflow.approve')
    )) available.push('history')
    if (hasPermission('workflow.delegate') || hasPermission('workflow.approve')) available.push('delegations')
    if (
      hasPermission('workflow.template.view')
      || hasPermission('workflow.template.create')
      || hasPermission('workflow.template.update')
      || hasPermission('workflow.template.publish')
    ) available.push('administration')
    return available
  }, [hasPermission])

  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0] ?? 'approvals')
  }, [tab, tabs])

  useEffect(() => {
    if (!isApiDataMode || !tabs.includes(tab)) return

    let active = true
    setLoading(true)
    setError('')
    const load = async () => {
      if (tab === 'approvals') {
        const page = await listWorkflowInstances({
          assignedToMe: true,
          status: 'pending_approval',
          resourceType: searchParams.get('resourceType') ?? undefined,
          pageSize: 100,
        })
        if (active) setApprovals(page.data)
      } else if (tab === 'history') {
        const pages = await Promise.all([
          listWorkflowInstances({ mine: true, pageSize: 100 }),
          listWorkflowInstances({ assignedToMe: true, pageSize: 100 }),
        ])
        if (active) {
          setHistory([...new Map(pages.flatMap((page) => page.data).map((item) => [item.id, item])).values()])
        }
      } else if (tab === 'delegations') {
        const page = await listWorkflowDelegations()
        if (active) setDelegations(page.data)
      } else if (hasPermission('workflow.template.view')) {
        const page = await listWorkflowTemplates()
        if (active) {
          setTemplates(page.data)
          setVersionTemplateId((current) => current || page.data[0]?.id || '')
        }
      } else {
        setTemplates([])
      }
    }

    load()
      .catch((cause: unknown) => {
        if (active) setError(errorText(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [hasPermission, refreshKey, searchParams, tab, tabs])

  const visibleHistory = useMemo(() => {
    const resourceId = searchParams.get('resourceId')
    return history.filter((item) =>
      (!searchParams.get('resourceType') || item.resource_type === searchParams.get('resourceType'))
      && (!resourceId || item.resource_id === resourceId),
    )
  }, [history, searchParams])
  const visibleApprovals = useMemo(() => {
    const resourceId = searchParams.get('resourceId')
    return approvals.filter((item) =>
      (!searchParams.get('resourceType') || item.resource_type === searchParams.get('resourceType'))
      && (!resourceId || item.resource_id === resourceId),
    )
  }, [approvals, searchParams])

  const submitTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await createWorkflowTemplate({
        key: templateForm.key.trim(),
        name: templateForm.name.trim(),
        module: templateForm.module.trim(),
        resourceType: templateForm.resourceType.trim(),
      })
      setTemplateForm({ key: '', name: '', module: '', resourceType: '' })
      setFeedback(text('Template created.'))
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const submitVersion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const parsed: unknown = JSON.parse(stepsJson)
      if (!Array.isArray(parsed)) throw new Error('Steps JSON must be an array.')
      await createWorkflowVersion(versionTemplateId, parsed as Array<Record<string, unknown>>)
      setFeedback(text('Version created.'))
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const publishVersion = async (versionId: string) => {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await publishWorkflowVersion(versionId)
      setFeedback(text('Version published.'))
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const revokeDelegation = async (delegation: WorkflowDelegation) => {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await revokeWorkflowDelegation(delegation.id)
      setFeedback(text('Delegation revoked.'))
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const tabLabels: Record<WorkflowTab, string> = {
    approvals: text('My approvals'),
    history: text('Workflow history'),
    delegations: text('Delegations'),
    administration: text('Administration'),
  }

  if (!isApiDataMode) {
    return (
      <div className="page workflow-page">
        <PageHeader eyebrow={text('Workflow center')} title={text('workflows')} subtitle={text('Items awaiting your decision')} />
        <div className="workflow-notice">{text('API mode required')}</div>
      </div>
    )
  }

  return (
    <div className="page workflow-page">
      <PageHeader eyebrow={text('Workflow center')} title={text('workflows')} subtitle={tab === 'history' ? text('Requests you submitted or reviewed') : text('Items awaiting your decision')}>
        <button type="button" className="button secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <RefreshCw size={15} />
          {text('Refresh')}
        </button>
      </PageHeader>

      <section className="workflow-hero">
        <div className="workflow-hero-mark"><GitBranch size={21} /></div>
        <div>
          <span className="eyebrow">{text('Workflow center')}</span>
          <strong>{tab === 'approvals' ? visibleApprovals.length : tab === 'history' ? visibleHistory.length : tab === 'delegations' ? delegations.length : templates.length}</strong>
          <p>{tabLabels[tab] ?? text('My approvals')}</p>
        </div>
        <div className="workflow-hero-aside">
          <ShieldCheck size={18} />
          <span>{text('Sequential, parallel and quorum rules are applied by the workflow engine.')}</span>
        </div>
      </section>

      <div className="workflow-tabs" role="tablist" aria-label={text('workflows')}>
        {tabs.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setError(''); setFeedback('') }}>
            {tabLabels[item]}
          </button>
        ))}
      </div>

      {error && <div className="workflow-alert error" role="alert">{error}</div>}
      {feedback && <div className="workflow-alert success" role="status">{feedback}</div>}
      {loading && <div className="workflow-loading"><span className="workflow-spinner" />{text('Loading workflows…')}</div>}

      {!loading && !error && tab === 'approvals' && (
        <section className="workflow-approval-list" aria-label={text('My approvals')}>
          {visibleApprovals.length ? visibleApprovals.map((item) => (
            <WorkflowRow key={item.id} instance={item} text={text} />
          )) : <EmptyState title={text('No pending approvals')} detail={text('Items awaiting your decision')} />}
        </section>
      )}

      {!loading && !error && tab === 'history' && (
        <section className="workflow-approval-list" aria-label={text('Workflow history')}>
          {visibleHistory.length ? [...visibleHistory].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '')).map((item) => (
            <WorkflowRow key={item.id} instance={item} text={text} />
          )) : <EmptyState title={text('No workflows found')} detail={text('Requests you submitted or reviewed')} />}
        </section>
      )}

      {!loading && !error && tab === 'delegations' && (
        <section className="panel workflow-panel">
          <div className="workflow-section-heading">
            <div><h2>{text('Delegations')}</h2><p>{text('Manage validity windows for approval assignments.')}</p></div>
            <Clock3 size={19} />
          </div>
          {delegations.length ? (
            <div className="workflow-table">
              {delegations.map((delegation) => {
                const instance = delegation.assignment?.step?.instance
                const isActive = !delegation.revoked_at && Date.parse(delegation.starts_at) <= Date.now() && Date.parse(delegation.ends_at) > Date.now()
                return (
                  <article className="workflow-delegation-row" key={delegation.id}>
                    <div className="workflow-row-main">
                      <strong>{delegation.delegate?.name ?? delegation.delegate_user_id}</strong>
                      <span>{instance?.resource_type ?? text('Resource')} · {instance?.resource_id ?? delegation.approval_assignment_id}</span>
                    </div>
                    <div className="workflow-row-meta">
                      <span>{text('Valid from')}: {new Date(delegation.starts_at).toLocaleString()}</span>
                      <span>{text('Valid until')}: {new Date(delegation.ends_at).toLocaleString()}</span>
                    </div>
                    <span className={`workflow-pill ${isActive ? 'active' : ''}`}>{delegation.revoked_at ? text('Revoked') : isActive ? text('Active') : text('Expired')}</span>
                    {hasPermission('workflow.delegate')
                      && delegation.delegator_user_id === String(currentUser?.id)
                      && !delegation.revoked_at && (
                      <button className="button secondary" disabled={busy} onClick={() => void revokeDelegation(delegation)}>{text('Revoke')}</button>
                    )}
                  </article>
                )
              })}
            </div>
          ) : <EmptyState title={text('No delegations found')} detail={text('Delegations')} />}
        </section>
      )}

      {!loading && !error && tab === 'administration' && (
        <div className="workflow-admin-grid">
          {hasPermission('workflow.template.create') && (
            <section className="panel workflow-panel">
              <div className="workflow-section-heading"><div><h2>{text('Create template')}</h2><p>{text('Configure a template for an existing business resource type.')}</p></div><FilePlus2 size={19} /></div>
              <form className="workflow-form" onSubmit={(event) => void submitTemplate(event)}>
                <label>{text('Template name')}<input required maxLength={150} value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} /></label>
                <label>{text('Template key')}<input required maxLength={100} pattern="[a-z0-9][a-z0-9._-]*" value={templateForm.key} onChange={(event) => setTemplateForm({ ...templateForm, key: event.target.value })} /></label>
                <label>{text('Module')}<input required maxLength={100} placeholder="leave / onboarding / offboarding" value={templateForm.module} onChange={(event) => setTemplateForm({ ...templateForm, module: event.target.value })} /></label>
                <label>{text('Resource type')}<input required maxLength={100} placeholder="leave_request" value={templateForm.resourceType} onChange={(event) => setTemplateForm({ ...templateForm, resourceType: event.target.value })} /></label>
                <button className="button primary" disabled={busy}><FilePlus2 size={15} />{text('Create template')}</button>
              </form>
            </section>
          )}

          {hasPermission('workflow.template.view') && (hasPermission('workflow.template.update') || hasPermission('workflow.template.publish')) && (
            <section className="panel workflow-panel">
              <div className="workflow-section-heading"><div><h2>{text('Create version')}</h2><p>{text('Use only approver rules and completion modes supported by the backend.')}</p></div><GitBranch size={19} /></div>
              <form className="workflow-form" onSubmit={(event) => void submitVersion(event)}>
                <label>{text('Template version')}
                  <select required value={versionTemplateId} onChange={(event) => setVersionTemplateId(event.target.value)}>
                    <option value="" disabled>{text('Select a template')}</option>
                    {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.key}</option>)}
                  </select>
                </label>
                <label>{text('Steps JSON')}
                  <textarea required rows={10} spellCheck={false} value={stepsJson} onChange={(event) => setStepsJson(event.target.value)} />
                </label>
                <small>{text('Modes: sequential, parallel. Completion: all, any, quorum. Approvers: user, role, manager_chain.')}</small>
                <button className="button primary" disabled={busy || !versionTemplateId}><GitBranch size={15} />{text('Create version')}</button>
              </form>
            </section>
          )}

          {hasPermission('workflow.template.view') && <section className="panel workflow-panel workflow-template-list">
            <div className="workflow-section-heading"><div><h2>{text('Published templates')}</h2><p>{text('Versions are immutable after publication.')}</p></div><Check size={19} /></div>
            {templates.length ? templates.map((template) => (
              <article className="workflow-template-row" key={template.id}>
                <div><strong>{template.name}</strong><span>{template.module} · {template.resource_type}</span></div>
                <div className="workflow-version-list">
                  {template.versions?.map((version) => (
                    <span className={`workflow-pill ${version.status === 'published' ? 'active' : ''}`} key={version.id}>
                      v{version.version_number} · {text(version.status === 'published' ? 'Published' : 'Draft')}
                      {version.status === 'draft' && hasPermission('workflow.template.publish') && (
                        <button type="button" disabled={busy} onClick={() => void publishVersion(version.id)}>{text('Publish')}</button>
                      )}
                    </span>
                  ))}
                </div>
              </article>
            )) : <EmptyState title={text('No workflows found')} detail={text('Save and publish workflows before submitting new requests.')} />}
          </section>}
        </div>
      )}
    </div>
  )
}

function WorkflowRow({ instance, text }: { instance: WorkflowInstance; text: (key: string) => string }) {
  const currentStep = instance.steps?.find((step) => step.status === 'active')
  const title = instance.version?.template?.name ?? instance.resource_type
  return (
    <Link className="workflow-row" to={`/app/workflows/${instance.id}`}>
      <div className="workflow-row-icon"><GitBranch size={18} /></div>
      <div className="workflow-row-main">
        <strong>{title}</strong>
        <span>{instance.resource_type} · {instance.resource_id}</span>
      </div>
      <div className="workflow-row-context">
        <span><small>{text('Requester')}</small>{instance.initiator?.name ?? instance.initiator_user_id}</span>
        {currentStep && <span><small>{text('Current step')}</small>{currentStep.key}</span>}
      </div>
      <span className={`workflow-pill ${instance.status === 'pending_approval' ? 'pending' : ''}`}>{statusLabel(instance.status, text)}</span>
      <ArrowUpRight size={17} className="workflow-row-arrow" />
    </Link>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="workflow-empty"><Clock3 size={20} /><strong>{title}</strong><span>{detail}</span></div>
}
