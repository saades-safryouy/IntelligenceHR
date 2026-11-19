import { useEffect, useState, type FormEvent } from 'react'
import { Plus, FileText, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { getEmployees, getOnboardingRequests, updateOnboardingTask } from '../../data/employeeStore'
import { employeeRepository, onboardingRepository } from '../../data/mockRepository'
import { apiData, isApiDataMode } from '../../lib/apiClient'
import { useAuth } from '../../contexts/authHooks'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import { downloadFile, generateCsv } from '../../components/dashboard/DashboardUtils'
import { translations } from '../../contexts/I18nContext'
import { useI18n } from '../../contexts/I18nContext'
import { employeeDashboardTranslations } from '../employee/translations'
import type { OnboardingRequest, RequestStatus } from '../../types/models'

export function OnboardingPage() {
  useEmployeeStore()
  const { hasPermission } = useAuth()
  const { language, text } = useI18n()
  const navigate = useNavigate()
  const t = translations[language]
  const employeeCopy = employeeDashboardTranslations[language]
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [error, setError] = useState('')
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(() => new Set())
  const [createForm, setCreateForm] = useState({ employeeId: '', position: '', department: '', startDate: '', assignee: '' })
  const [employees, setEmployees] = useState(() => (!isApiDataMode ? getEmployees() : []))
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null)
  const [requests, setRequests] = useState<OnboardingRequest[]>(() => (!isApiDataMode ? getOnboardingRequests() : []))

  const loadRequests = () => {
    onboardingRepository.list()
      .then((res) => setRequests(res.data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load onboarding requests.'))
  }

  useEffect(() => {
    if (isApiDataMode) {
      loadRequests()
      employeeRepository.list({ page: 1, pageSize: 100 })
        .then((page) => setEmployees(page.data.filter((employee) => employee.status !== 'Terminated')))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Failed to load employees.'))
    }
  }, [])

  const filtered =
    statusFilter === 'all' ? requests : requests.filter((req) => req.status === statusFilter)

  const exportRequests = () => {
    const csv = generateCsv(
      ['Employee', 'Position', 'Department', 'Start date', 'Stage', 'Assignee', 'Progress', 'Status'],
      requests.map((request) => [
        request.employee,
        request.position,
        request.department,
        request.startDate,
        request.stage,
        request.assignee,
        request.progress,
        request.status,
      ]),
    )
    downloadFile(csv, 'onboarding-requests.csv')
  }

  const toggleEmployeeTask = (requestId: string, taskId: string, done: boolean) => {
    if (isApiDataMode) {
      if (updatingTaskIds.has(taskId)) return
      setUpdatingTaskIds((current) => new Set(current).add(taskId))
      apiData(`/api/v1/onboarding-tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ done }),
      })
        .then(() => loadRequests())
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Failed to update onboarding task.'))
        .finally(() => {
          setUpdatingTaskIds((current) => {
            const next = new Set(current)
            next.delete(taskId)
            return next
          })
        })
      return
    }

    const request = requests.find((item) => item.id === requestId)
    if (!request) return
    const employeeTasks = request.employeeTasks.map((task) =>
      task.id === taskId ? { ...task, done } : task,
    )
    const progress = employeeTasks.length
      ? Math.round((employeeTasks.filter((task) => task.done).length / employeeTasks.length) * 100)
      : request.progress
    const status = (progress === 100 ? 'Completed' : request.status === 'Completed' ? 'On track' : request.status) as RequestStatus
    const updates = { employeeTasks, progress, status }

    onboardingRepository.update(requestId, updates)
      .then(() => {
        updateOnboardingTask(requestId, updates)
        setRequests(getOnboardingRequests())
      })
      .catch((err) => console.error('Failed to update onboarding task:', err))
  }

  const createRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createBusy) return
    const employee = employees.find((item) => String(item.userId) === createForm.employeeId)
    if (!employee) {
      setCreateError(text('Select an employee'))
      return
    }

    setCreateBusy(true)
    setCreateError('')
    try {
      const request = await onboardingRepository.create({
        employee: `${employee.firstName} ${employee.lastName}`.trim(),
        userId: employee.userId,
        position: createForm.position.trim(),
        department: createForm.department.trim(),
        startDate: createForm.startDate,
        stage: 'HR Validation',
        assignee: createForm.assignee.trim() || 'HR Team',
        progress: 0,
        status: 'On track',
        employeeTasks: [],
      })
      setRequests((current) => [request, ...current])
      setCreateOpen(false)
      setCreateForm({ employeeId: '', position: '', department: '', startDate: '', assignee: '' })
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Failed to create onboarding request.')
    } finally {
      setCreateBusy(false)
    }
  }

  const saveStatus = async (request: OnboardingRequest, nextStatus: RequestStatus) => {
    if (savingStatusId) return
    setSavingStatusId(request.id)
    setError('')
    try {
      const updated = await onboardingRepository.update(request.id, { status: nextStatus })
      if (!updated) throw new Error('The onboarding request could not be updated.')
      setRequests((current) => current.map((item) => item.id === request.id ? updated : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update onboarding request.')
    } finally {
      setSavingStatusId(null)
    }
  }

  const stats = {
    total: requests.filter((r) => r.status !== 'Completed').length,
    onTrack: requests.filter((r) => r.status === 'On track').length,
    atRisk: requests.filter((r) => r.status === 'At risk').length,
    completed: requests.filter((r) => r.status === 'Completed').length,
  }

  const getStatusColor = (status: RequestStatus) => {
    const colors: Record<RequestStatus, string> = {
      'On track': '#10b981',
      'At risk': '#f59e0b',
      Overdue: '#ef4444',
      Completed: '#6b7280',
    }
    return colors[status] || '#e5e7eb'
  }

  return (
    <div className="page">
      <Breadcrumb items={[{ label: t.onboarding }]} />
      <PageHeader
        eyebrow={`ONBOARDING · ${stats.total} ACTIVE`}
        title={t.onboarding}
        subtitle="Track and manage employee onboarding workflows."
      >
        <button type="button" className="button secondary" onClick={exportRequests}>
          <FileText size={16} />
          {t.export}
        </button>
        {(!isApiDataMode || hasPermission('people.employee.create')) && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setCreateError('')
              setCreateOpen(true)
            }}
          >
            <Plus size={16} />
            New Request
          </button>
        )}
      </PageHeader>
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}

      <section className="stats-grid">
        <div className="stat-card">
          <span>Active</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="stat-card">
          <span>On Track</span>
          <strong className="success-text">{stats.onTrack}</strong>
        </div>
        <div className="stat-card">
          <span>At Risk</span>
          <strong className="warning-text">{stats.atRisk}</strong>
        </div>
        <div className="stat-card">
          <span>Completed</span>
          <strong>{stats.completed}</strong>
        </div>
      </section>
      {createOpen && (
        <div className="drawer-backdrop" onClick={() => setCreateOpen(false)}>
          <aside className="employee-drawer leave-drawer" role="dialog" aria-modal="true" aria-labelledby="onboarding-create-title" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <span id="onboarding-create-title">{text('Create onboarding request')}</span>
              <button type="button" className="icon-button" onClick={() => setCreateOpen(false)} aria-label={text('Close')}>×</button>
            </div>
            <form className="leave-form" onSubmit={(event) => void createRequest(event)}>
              {createError && <div className="toast-inline toast-error" role="alert">{createError}</div>}
              <label>{text('Employee')}
                <select required value={createForm.employeeId} onChange={(event) => {
                  const selected = employees.find((employee) => String(employee.userId) === event.target.value)
                  setCreateForm({
                    ...createForm,
                    employeeId: event.target.value,
                    position: selected?.jobTitle ?? '',
                    department: selected?.department ?? '',
                  })
                }}>
                  <option value="" disabled>{text('Select an employee')}</option>
                  {employees.map((employee) => <option key={employee.userId} value={employee.userId}>{employee.firstName} {employee.lastName}</option>)}
                </select>
              </label>
              <label>{text('Position')}
                <input required value={createForm.position} onChange={(event) => setCreateForm({ ...createForm, position: event.target.value })} />
              </label>
              <label>{text('Department')}
                <input required value={createForm.department} onChange={(event) => setCreateForm({ ...createForm, department: event.target.value })} />
              </label>
              <label>{text('Start date')}
                <input type="date" required value={createForm.startDate} onChange={(event) => setCreateForm({ ...createForm, startDate: event.target.value })} />
              </label>
              <label>{text('Assignee')}
                <input value={createForm.assignee} onChange={(event) => setCreateForm({ ...createForm, assignee: event.target.value })} />
              </label>
              <div className="leave-form-actions">
                <button type="button" className="button secondary" onClick={() => setCreateOpen(false)}>{text('Cancel')}</button>
                <button type="submit" className="button primary" disabled={createBusy}>{t.create}</button>
              </div>
            </form>
          </aside>
        </div>
      )}

      <section className="panel">
        <div className="panel-header">
          <h3>Onboarding Requests</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | RequestStatus)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="On track">On Track</option>
            <option value="At risk">At Risk</option>
            <option value="Overdue">Overdue</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <div className="request-list">
          {filtered.map((req) => (
            <div
              key={req.id}
              className="request-item"
            >
              <button
                type="button"
                className="request-header request-header-button"
                aria-expanded={expandedId === req.id}
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              >
                <div className="request-info">
                  <strong>{req.employee}</strong>
                  <small>
                    {req.position} · {req.department}
                    {req.approvalStatus && ` · Approval: ${req.approvalStatus.replaceAll('_', ' ')}`}
                  </small>
                </div>
                <div
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(req.status) }}
                >
                  {req.status}
                </div>
                <ChevronRight size={18} />
              </button>

              {expandedId === req.id && (
                <div className="request-details">
                  <div className="details-grid">
                    <div>
                      <span>Start Date</span>
                      <strong>{req.startDate}</strong>
                    </div>
                    <div>
                      <span>Stage</span>
                      <strong>{req.stage}</strong>
                    </div>
                    <div>
                      <span>Assignee</span>
                      <strong>{req.assignee}</strong>
                    </div>
                    <div>
                      <span>Progress</span>
                      <strong>{req.progress}%</strong>
                    </div>
                    {req.approvalStatus && (
                      <div>
                        <span>Approval status</span>
                        <strong>{req.approvalStatus.replaceAll('_', ' ')}</strong>
                      </div>
                    )}
                    {hasPermission('people.employee.update') && (
                      <label className="workflow-edit-status">
                        Status
                        <select
                          value={req.status}
                          disabled={savingStatusId === req.id}
                          onChange={(event) => { void saveStatus(req, event.target.value as RequestStatus) }}
                        >
                          <option value="On track">On Track</option>
                          <option value="At risk">At Risk</option>
                          <option value="Overdue">Overdue</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </label>
                    )}
                  </div>
                  {req.approvalStatus && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => navigate(`/app/workflows?resourceType=onboarding_case&resourceId=${encodeURIComponent(req.id)}`)}
                    >
                      View workflow
                    </button>
                  )}
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${req.progress}%` }} />
                  </div>
                  {req.employeeTasks.length > 0 && (
                    <div className="workflow-task-list">
                      <h4>Employee checklist</h4>
                      {req.employeeTasks.map((task) => (
                        <label className="workflow-task" key={task.id}>
                          {(hasPermission('people.employee.update') || hasPermission('people.employee.self.update') || !isApiDataMode) && (
                            <input
                              type="checkbox"
                              checked={task.done}
                              disabled={updatingTaskIds.has(task.id)}
                              onChange={(event) => toggleEmployeeTask(req.id, task.id, event.target.checked)}
                            />
                          )}
                          <span>
                            {task.labelKey in employeeCopy
                              ? employeeCopy[task.labelKey as keyof typeof employeeCopy]
                              : task.labelKey}
                          </span>
                          {task.dueDate && <small>Due {task.dueDate}</small>}
                        </label>
                      ))}
                      {filtered.length === 0 && <div className="empty-state">No onboarding requests match this status.</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
