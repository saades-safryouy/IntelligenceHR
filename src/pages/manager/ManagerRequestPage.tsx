import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { getWorkflowInstance, getWorkflowInstanceResource } from '../../data/apiWorkflowRepository'
import { isApiDataMode } from '../../lib/apiClient'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value) ?? '—'
}

function requestFields(
  type: string,
  resource: Record<string, unknown>,
  text: (key: string) => string,
): Array<[string, unknown]> {
  if (type === 'leave_request') {
    const employee = resource.employee as Record<string, unknown> | null
    const leaveType = resource.leave_type as Record<string, unknown> | null
    const employeeName = employee
      ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
      : resource.employee_name
    return [
      [text('Employee'), employeeName],
      [text('Job title'), employee?.job_title],
      [text('Department'), employee?.department],
      [text('Team'), employee?.team],
      [text('Leave type'), leaveType?.name_key],
      [text('Start date'), resource.start_date],
      [text('End date'), resource.end_date],
      [text('Duration'), resource.duration],
      [text('Status'), resource.status],
      [text('Note'), resource.note],
    ]
  }

  if (type === 'onboarding_case') {
    return [
      [text('Employee'), resource.employee_name],
      [text('Position'), resource.position],
      [text('Department'), resource.department],
      [text('Start date'), resource.start_date],
      [text('Stage'), resource.stage],
      [text('Progress'), resource.progress],
      [text('Status'), resource.status],
      [text('Approval status'), resource.approval_status],
    ]
  }

  if (type === 'offboarding_case') {
    return [
      [text('Employee'), resource.employee_name],
      [text('Exit date'), resource.exit_date],
      [text('Reason'), resource.reason],
      [text('Replacement'), resource.replacement],
      [text('Stage'), resource.stage],
      [text('Progress'), resource.progress],
      [text('Status'), resource.status],
      [text('Approval status'), resource.approval_status],
    ]
  }

  return []
}

export function ManagerRequestPage() {
  const { resourceType = '', resourceId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const workflowId = searchParams.get('workflowId') ?? ''
  const { language, text } = useI18n()
  const copy = managerTranslations[language]
  const [resource, setResource] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  const load = useCallback(async () => {
    if (!isApiDataMode) return
    if (!workflowId) {
      setError(copy.loadError)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const instance = await getWorkflowInstance(workflowId)
      if (instance.resource_type !== resourceType || instance.resource_id !== resourceId) {
        throw new Error(copy.loadError)
      }
      setResource(await getWorkflowInstanceResource(workflowId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [copy.loadError, resourceId, resourceType, workflowId])

  useEffect(() => { void load() }, [load, retry])

  const fields = useMemo(
    () => resource ? requestFields(resourceType, resource, text).filter(([, value]) => value !== undefined) : [],
    [resource, resourceType, text],
  )

  if (!isApiDataMode) return <ManagerApiNotice message={copy.apiRequired} />

  return (
    <div className="page manager-page">
      <PageHeader eyebrow={copy.approvals} title={copy.originalRequest} subtitle={`${resourceType} · ${resourceId}`}>
        <Link className="button secondary" to={workflowId ? `/manager/workflows/${encodeURIComponent(workflowId)}` : '/manager/approvals'}><ArrowLeft size={15} />{text('Back to workflows')}</Link>
      </PageHeader>
      {error && <div className="manager-alert" role="alert"><span>{error}</span><button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>{copy.retry}</button></div>}
      {loading ? (
        <div className="manager-loading" role="status"><span className="manager-spinner" />{copy.loading}</div>
      ) : resource ? (
        <section className="panel manager-request-panel">
          <div className="manager-panel-heading">
            <div><span>{resourceType}</span><h2>{copy.originalRequest}</h2><p>{text('Request context')}</p></div>
            <span className="manager-panel-icon"><FileText size={18} /></span>
          </div>
          {fields.length ? (
            <dl className="manager-request-fields">
              {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}
            </dl>
          ) : <div className="manager-empty"><p>{copy.loadError}</p></div>}
        </section>
      ) : null}
    </div>
  )
}
