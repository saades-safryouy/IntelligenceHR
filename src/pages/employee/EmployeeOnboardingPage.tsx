import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import { getMyOnboarding, isOnboardingTaskDone, resolveEmployee, toggleOnboardingTask } from '../../data/employeeStore'
import { apiEmployeeRepository } from '../../data/apiEmployeeRepository'
import { apiData, isApiDataMode } from '../../lib/apiClient'
import type { EmployeeDashboardData } from '../../data/apiEmployeeRepository'
import { ONBOARDING_STAGE_ORDER } from '../../types/models'
import { formatDate } from '../../utils/dates'
import { employeeDashboardTranslations } from './translations'
import { EmptyState, ProgressBar, StatusBadge } from './components'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'

export function EmployeeOnboardingPage() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const location = useLocation()
  const t = employeeDashboardTranslations[language]
  const [apiSummary, setApiSummary] = useState<EmployeeDashboardData | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busyTask, setBusyTask] = useState('')
  const [reload, setReload] = useState(0)
  const [now] = useState(() => Date.now())
  const employee = isApiDataMode ? apiSummary?.employee : resolveEmployee(currentUser)
  const requestedCaseId = location.hash.startsWith('#request-')
    ? decodeURIComponent(location.hash.slice('#request-'.length))
    : ''
  const request = isApiDataMode
    ? requestedCaseId
      ? apiSummary?.onboardingCases.find((item) => item.id === requestedCaseId)
      : apiSummary?.onboardingCases[0]
    : employee ? getMyOnboarding(employee.userId) : undefined

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    setLoading(true)
    setError('')
    apiEmployeeRepository.getSummary()
      .then((summary) => { if (active) setApiSummary(summary) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : t.loadFailed) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload, t.loadFailed])

  useEffect(() => {
    if (location.hash.startsWith('#request-')) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' })
    }
  }, [location.hash, request?.id])

  if (loading) {
    return <div className="page employee-page"><div className="empty-block" role="status">{t.loading}</div></div>
  }

  if (!employee && !error) {
    return (
      <div className="page">
        <div className="empty-block">{t.notFound}</div>
      </div>
    )
  }

  if (error && !request) {
    return (
      <div className="page employee-page">
        <PageHeader eyebrow={t.employeePortal} title={t.onboardingTitle} subtitle={t.onboardingSubtitle} />
        <div className="toast-inline toast-error" role="alert">{error}</div>
        <button className="button secondary" onClick={() => setReload((value) => value + 1)}>{t.tryAgain}</button>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="page employee-page">
        <PageHeader eyebrow={t.employeePortal} title={t.onboardingTitle} subtitle={t.onboardingSubtitle} />
        <section className="panel">
          <EmptyState title={requestedCaseId ? t.requestUnavailable : t.noOnboarding} />
        </section>
      </div>
    )
  }

  const visibleTasks = request.employeeTasks.filter((task) => task.employeeVisible)
  const currentIndex = ONBOARDING_STAGE_ORDER.indexOf(request.stage as (typeof ONBOARDING_STAGE_ORDER)[number])
  const taskDone = (taskId: string) => isApiDataMode
    ? visibleTasks.find((task) => task.id === taskId)?.done ?? false
    : isOnboardingTaskDone(taskId, request)

  const updateTask = async (taskId: string, done: boolean) => {
    if (!isApiDataMode) {
      toggleOnboardingTask(taskId, done)
      setFeedback(t.taskSaved)
      return
    }
    if (busyTask) return
    setBusyTask(taskId)
    setError('')
    try {
      await apiData(`/api/v1/onboarding-tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ done }),
      })
      setFeedback(t.taskSaved)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.saveFailed)
    } finally {
      setBusyTask('')
    }
  }

  return (
    <div className="page employee-page" id={`request-${request.id}`}>
      <PageHeader eyebrow={t.employeePortal} title={t.onboardingTitle} subtitle={t.onboardingSubtitle} />
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}
      {feedback && <div className="toast-inline" role="status">{feedback}</div>}

      <section className="kpi-grid employee-kpis">
        <article className="kpi-card">
          <span className="kpi-label">{t.progress}</span>
          <strong className="kpi-value">
            {request.progress}
            <small>%</small>
          </strong>
          <ProgressBar percentage={request.progress} tone="mint" label={`${request.progress}%`} />
        </article>
        <article className="kpi-card">
          <span className="kpi-label">{t.stage}</span>
          <strong className="kpi-value" style={{ fontSize: 18 }}>{request.stage}</strong>
          <div className="kpi-trend">{request.id}</div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{t.stage}</h2>
          </div>
        </div>
        <ol className="onboarding-stages">
          {ONBOARDING_STAGE_ORDER.map((stage, index) => {
            const done = index < currentIndex || request.stage === 'Completed'
            const current = stage === request.stage
            return (
              <li key={stage} className={done ? 'done' : current ? 'current' : ''}>
                <StatusBadge
                  status={done ? 'approved' : current ? 'pending' : 'info'}
                  label={stage}
                />
              </li>
            )
          })}
        </ol>
      </section>

      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>{t.tasks}</h2>
            <span>
              {visibleTasks.filter((task) => taskDone(task.id)).length} / {visibleTasks.length}
            </span>
          </div>
        </div>
        <ul className="holiday-board">
          {visibleTasks.map((task) => {
            const done = taskDone(task.id)
            const overdue = task.dueDate ? Date.parse(task.dueDate) < now && !done : false
            return (
              <li key={task.id}>
                <label className="task-row">
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={Boolean(busyTask)}
                    onChange={(event) => { void updateTask(task.id, event.target.checked) }}
                  />
                  <div>
                    <strong>{t[task.labelKey as keyof typeof t] || task.labelKey}</strong>
                    {task.dueDate && (
                      <span>
                        {t.dueDate}: {formatDate(task.dueDate, language)}
                        {overdue ? ` · ${t.overdue}` : ''}
                      </span>
                    )}
                  </div>
                </label>
                <em>
                  <StatusBadge status={done ? 'approved' : overdue ? 'rejected' : 'pending'} label={done ? t.taskDone : overdue ? t.overdue : t.taskPending} />
                </em>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
