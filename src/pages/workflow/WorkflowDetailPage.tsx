import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCheck, Clock3, GitBranch, MessageSquareText, UserRound, UsersRound } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { employeeDashboardTranslations } from '../employee/translations'
import { ApiError, isApiDataMode } from '../../lib/apiClient'
import {
  createWorkflowDelegation,
  decideWorkflow,
  getWorkflowHistory,
  getWorkflowInstance,
  getWorkflowInstanceResource,
  getWorkflowResource,
  type WorkflowEvent,
  type WorkflowInstance,
  type WorkflowStep,
} from '../../data/apiWorkflowRepository'
import './WorkflowPage.css'

const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'

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

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? String(value)
}

function businessContext(resourceType: string, resource: Record<string, unknown>, text: (key: string) => string) {
  const employee = resource.employee as Record<string, unknown> | undefined
  const leaveType = resource.leave_type as Record<string, unknown> | undefined
  const name = employee ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() : undefined
  const fields: Array<[string, unknown]> = resourceType === 'leave_request'
    ? [
      [text('Employee'), name],
      [text('Leave type'), leaveType?.name_key ?? resource.leave_type_id],
      [text('Start date'), resource.start_date],
      [text('End date'), resource.end_date],
      [text('Duration'), resource.duration],
      [text('Note'), resource.note],
      [text('Status'), resource.status],
    ]
    : resourceType === 'onboarding_case'
      ? [
        [text('Employee'), resource.employee_name],
        [text('Position'), resource.position],
        [text('Department'), resource.department],
        [text('Start date'), resource.start_date],
        [text('Stage'), resource.stage],
        [text('Progress'), resource.progress],
        [text('Status'), resource.status],
        [text('Approval status'), resource.approval_status],
      ]
      : [
        [text('Employee'), resource.employee_name],
        [text('Exit date'), resource.exit_date],
        [text('Reason'), resource.reason],
        [text('Replacement'), resource.replacement],
        [text('Stage'), resource.stage],
        [text('Progress'), resource.progress],
        [text('Status'), resource.status],
        [text('Approval status'), resource.approval_status],
      ]

  return fields.filter(([, value]) => value !== undefined)
}

function currentUserCanAct(step: WorkflowStep, currentUserId: string, now: number): string | undefined {
  return step.assignments.find((assignment) => {
    if (assignment.status !== 'pending') return false
    if (assignment.approver_user_id === currentUserId) return true
    return assignment.delegations?.some((delegation) =>
      delegation.delegate_user_id === currentUserId
      && !delegation.revoked_at
      && Date.parse(delegation.starts_at) <= now
      && Date.parse(delegation.ends_at) > now,
    )
  })?.id
}

export function WorkflowDetailPage() {
  const { instanceId = '' } = useParams()
  const { pathname } = useLocation()
  const employeePortal = pathname.startsWith('/employee/')
  const managerPortal = pathname.startsWith('/manager/')
  const backPath = employeePortal ? '/employee/workflows' : managerPortal ? '/manager/approvals' : '/app/workflows'
  const { currentUser, hasPermission } = useAuth()
  const { language, text } = useI18n()
  const employeeCopy = employeeDashboardTranslations[language]
  const [instance, setInstance] = useState<WorkflowInstance | null>(null)
  const [events, setEvents] = useState<WorkflowEvent[]>([])
  const [resource, setResource] = useState<Record<string, unknown> | null>(null)
  const [contextUnavailable, setContextUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [comment, setComment] = useState('')
  const [delegateUserId, setDelegateUserId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    setContextUnavailable(false)
    try {
      const loaded = await getWorkflowInstance(instanceId)
      setInstance(loaded)
      if (hasPermission('workflow.history.view')) {
        const history = await getWorkflowHistory(instanceId)
        setEvents(history.data)
      } else {
        setEvents([])
      }
      try {
        const context = managerPortal
          ? await getWorkflowInstanceResource(loaded.id)
          : await getWorkflowResource(loaded.resource_type, loaded.resource_id)
        setResource(context)
      } catch (contextError) {
        if (contextError instanceof ApiError && (contextError.status === 403 || contextError.status === 404)) {
          setResource(null)
          setContextUnavailable(true)
        } else {
          throw contextError
        }
      }
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setLoading(false)
    }
  }, [hasPermission, instanceId, managerPortal])

  useEffect(() => {
    if (isApiDataMode) void reload()
  }, [refreshKey, reload])

  const currentStep = useMemo(() => instance?.steps?.find((step) => step.status === 'active'), [instance])
  const actionableAssignmentId = useMemo(() => {
    if (!currentStep || !currentUser || !hasPermission('workflow.approve')) return undefined
    return currentUserCanAct(currentStep, String(currentUser.id), Date.now())
  }, [currentStep, currentUser, hasPermission])
  const delegatableAssignment = currentStep?.assignments.find((assignment) =>
    assignment.status === 'pending' && assignment.approver_user_id === String(currentUser?.id),
  )

  const makeDecision = async (action: 'approve' | 'reject' | 'return') => {
    if (!instance || !actionableAssignmentId || busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await decideWorkflow(instance.id, {
        assignmentId: actionableAssignmentId,
        action,
        comment: comment.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      setComment('')
      setFeedback(text('Workflow action saved.'))
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const submitDelegation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!delegatableAssignment || busy) return
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await createWorkflowDelegation({
        assignmentId: delegatableAssignment.id,
        delegateUserId: delegateUserId.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      })
      setDelegateUserId('')
      setStartsAt('')
      setEndsAt('')
      setFeedback(text('Delegation saved.'))
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (!isApiDataMode) {
    return (
      <div className="page workflow-page">
        <PageHeader eyebrow={text('Workflow detail')} title={text('workflows')} subtitle={text('API mode required')} />
        <div className="workflow-notice">{text('API mode required')}</div>
      </div>
    )
  }

  const contextFields = instance && resource
    ? businessContext(instance.resource_type, resource, text)
    : []
  const originalRequestPath = instance
    ? requestPath(instance.resource_type, instance.resource_id, employeePortal, managerPortal, instance.id)
    : null

  return (
    <div className="page workflow-page">
      <PageHeader
        eyebrow={instance?.version?.template?.module?.toUpperCase() ?? text('Workflow detail')}
        title={instance?.version?.template?.name ?? text('Workflow details')}
        subtitle={instance ? `${instance.resource_type} · ${instance.resource_id}` : text('Loading workflows…')}
      >
        <Link className="button secondary" to={backPath}><ArrowLeft size={15} />{text('Back to workflows')}</Link>
        {originalRequestPath && resource && (
          <Link className="button secondary" to={originalRequestPath}>
            <ArrowLeft size={15} />{employeePortal ? employeeCopy.openOriginalRequest : text('Open original request')}
          </Link>
        )}
      </PageHeader>

      {error && (
        <div className="workflow-alert error" role="alert">
          <span>{error}</span>
          <button type="button" className="button secondary" onClick={() => setRefreshKey((value) => value + 1)}>{text('Retry')}</button>
        </div>
      )}
      {feedback && <div className="workflow-alert success" role="status">{feedback}</div>}
      {loading && <div className="workflow-loading"><span className="workflow-spinner" />{text('Loading workflows…')}</div>}

      {!loading && instance && (
        <>
          <section className="workflow-detail-top">
            <div className="workflow-detail-title">
              <span className="workflow-row-icon"><GitBranch size={19} /></span>
              <div>
                <span className="eyebrow">{instance.version?.template?.module ?? text('workflows')}</span>
                <h2>{instance.resource_type} <span>/{instance.resource_id}</span></h2>
                <p>{text('Requester')}: <strong>{instance.initiator?.name ?? instance.initiator_user_id}</strong></p>
              </div>
            </div>
            <span className={`workflow-pill ${instance.status === 'pending_approval' ? 'pending' : 'active'}`}>{statusLabel(instance.status, text)}</span>
          </section>

          <div className="workflow-detail-grid">
            <div className="workflow-detail-main">
              <section className="panel workflow-panel">
                <div className="workflow-section-heading"><div><h2>{text('Approval steps')}</h2><p>{text('Current step')}: {currentStep?.key ?? statusLabel(instance.status, text)}</p></div><UsersRound size={19} /></div>
                <div className="workflow-steps">
                  {instance.steps?.map((step) => (
                    <article className={`workflow-approval-step ${step.status === 'active' ? 'current' : ''}`} key={step.id}>
                      <div className={`workflow-step-marker ${step.status === 'approved' ? 'complete' : ''}`}>{step.status === 'approved' ? <CheckCheck size={16} /> : <span>{step.sequence}</span>}</div>
                      <div className="workflow-step-content">
                        <div className="workflow-step-title">
                          <strong>{step.key}</strong>
                          <span className={`workflow-pill ${step.status === 'active' ? 'pending' : ''}`}>{text(step.status)}</span>
                        </div>
                        <p>{step.mode} · {step.completion_rule}{step.quorum ? ` (${step.quorum})` : ''}</p>
                        <div className="workflow-approvers">
                          {step.assignments.map((assignment) => (
                            <span key={assignment.id} className={assignment.status === 'approved' ? 'complete' : ''}>
                              <UserRound size={13} />{assignment.approver?.name ?? assignment.approver_user_id} · {text(assignment.status)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {actionableAssignmentId && (
                <section className="panel workflow-panel workflow-decision">
                  <div className="workflow-section-heading"><div><h2>{text('Available actions')}</h2><p>{text('Comments are recorded with your decision.')}</p></div><MessageSquareText size={19} /></div>
                  <label>{text('Comment (optional)')}<textarea rows={4} maxLength={5000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
                  <div className="workflow-decision-actions">
                    <button className="button secondary" disabled={busy} onClick={() => void makeDecision('return')}>{text('Return for correction')}</button>
                    <button className="button secondary" disabled={busy} onClick={() => void makeDecision('reject')}>{text('Reject')}</button>
                    <button className="button primary" disabled={busy} onClick={() => void makeDecision('approve')}><CheckCheck size={15} />{text('Approve')}</button>
                  </div>
                </section>
              )}

              {hasPermission('workflow.delegate') && delegatableAssignment && (
                <section className="panel workflow-panel">
                  <div className="workflow-section-heading"><div><h2>{text('Delegate approval')}</h2><p>{text('Delegation applies only to this active assignment and validity window.')}</p></div><Clock3 size={19} /></div>
                  <form className="workflow-form" onSubmit={(event) => void submitDelegation(event)}>
                    <label>{text('Delegate user ID')}<input required type="text" value={delegateUserId} onChange={(event) => setDelegateUserId(event.target.value)} /></label>
                    <label>{text('Valid from')}<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
                    <label>{text('Valid until')}<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
                    <button className="button secondary" disabled={busy}>{text('Create delegation')}</button>
                  </form>
                </section>
              )}

              {hasPermission('workflow.history.view') && (
                <section className="panel workflow-panel">
                  <div className="workflow-section-heading"><div><h2>{text('Approval timeline')}</h2><p>{text('Submitted')} · {instance.submitted_at ? new Date(instance.submitted_at).toLocaleString() : '—'}</p></div><Clock3 size={19} /></div>
                  {events.length ? (
                    <ol className="workflow-timeline">
                      {events.map((event) => <TimelineEvent key={event.id} event={event} text={text} />)}
                    </ol>
                  ) : <div className="workflow-empty">{text('No timeline events')}</div>}
                </section>
              )}
            </div>

            <aside className="workflow-detail-aside">
              <section className="panel workflow-panel">
                <div className="workflow-section-heading"><div><h2>{text('Request context')}</h2><p>{text('Resource')}: {instance.resource_type}</p></div><FileContextIcon /></div>
                {contextUnavailable ? <div className="workflow-empty">{text('Context unavailable')}</div> : resource ? (
                  <dl className="workflow-context">
                    {contextFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}
                  </dl>
                ) : <div className="workflow-empty">{text('Loading workflows…')}</div>}
              </section>

              <section className="panel workflow-panel">
                <div className="workflow-section-heading"><div><h2>{text('Approval history')}</h2><p>{text('Comments and actor decisions')}</p></div><MessageSquareText size={19} /></div>
                {instance.actions?.length ? (
                  <div className="workflow-action-history">
                    {instance.actions.map((action) => (
                      <article key={action.id}>
                        <strong>{text(action.action)} · {action.actor?.name ?? action.actor_user_id}</strong>
                        <time>{new Date(action.occurred_at).toLocaleString()}</time>
                        {action.comment && <p>{action.comment}</p>}
                      </article>
                    ))}
                  </div>
                ) : <div className="workflow-empty">{text('No approval actions')}</div>}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function TimelineEvent({ event, text }: { event: WorkflowEvent; text: (key: string) => string }) {
  const comment = typeof event.data?.comment === 'string' ? event.data.comment : ''
  return (
    <li>
      <span className="workflow-timeline-dot" />
      <div><strong>{text(event.event_type)}</strong><small>{event.actor?.name ?? '—'} · {new Date(event.occurred_at).toLocaleString()}</small>
        {event.from_status !== event.to_status && (event.from_status || event.to_status) && <span>{statusLabel(event.from_status ?? 'Submitted', text)} → {statusLabel(event.to_status ?? '', text)}</span>}
        {comment && <p>{comment}</p>}
      </div>
    </li>
  )
}

function FileContextIcon() {
  return <GitBranch size={19} />
}

function requestPath(resourceType: string, resourceId: string, employeePortal: boolean, managerPortal: boolean, workflowId: string): string | null {
  if (managerPortal) {
    return `/manager/requests/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}?workflowId=${encodeURIComponent(workflowId)}`
  }
  const routes: Record<string, string> = employeePortal
    ? {
      leave_request: '/employee/leave',
      onboarding_case: '/employee/onboarding',
      offboarding_case: '/employee/offboarding',
    }
    : {
      leave_request: '/app/leave/requests',
      onboarding_case: '/app/onboarding/requests',
      offboarding_case: '/app/offboarding/requests',
    }
  const route = routes[resourceType]
  if (!route) return null
  const anchor = `request-${encodeURIComponent(resourceId)}`
  return `${route}#${anchor}`
}
