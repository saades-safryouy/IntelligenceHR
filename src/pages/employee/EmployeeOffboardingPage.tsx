import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import { getOffboardingTasksByEmployee, resolveEmployee } from '../../data/employeeStore'
import { apiEmployeeRepository, type EmployeeDashboardData } from '../../data/apiEmployeeRepository'
import { isApiDataMode } from '../../lib/apiClient'
import { formatDate } from '../../utils/dates'
import { employeeDashboardTranslations } from './translations'
import { EmptyState, ProgressBar, StatusBadge } from './components'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'

export function EmployeeOffboardingPage() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const location = useLocation()
  const t = employeeDashboardTranslations[language]
  const [apiSummary, setApiSummary] = useState<EmployeeDashboardData | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const employee = isApiDataMode ? apiSummary?.employee : resolveEmployee(currentUser)
  const cases = useMemo(() => isApiDataMode
    ? apiSummary?.offboardingCases ?? []
    : employee ? getOffboardingTasksByEmployee(employee.id) : [], [apiSummary, employee])

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
  }, [cases, location.hash])

  if (loading) {
    return <div className="page employee-page"><div className="empty-block" role="status">{t.loading}</div></div>
  }

  if (error || (!employee && isApiDataMode)) {
    return (
      <div className="page employee-page">
        <PageHeader eyebrow={t.employeePortal} title={t.offboardingTitle} subtitle={t.offboardingSubtitle} />
        <div className="toast-inline toast-error" role="alert">{error || t.notFound}</div>
        {error && <button className="button secondary" onClick={() => setReload((value) => value + 1)}>{t.tryAgain}</button>}
      </div>
    )
  }

  return (
    <div className="page employee-page">
      <PageHeader eyebrow={t.employeePortal} title={t.offboardingTitle} subtitle={t.offboardingSubtitle} />
      {cases.length ? cases.map((item) => (
        <section className="panel" id={`request-${item.id}`} key={item.id}>
          <div className="panel-title">
            <div>
              <h2>{item.employee}</h2>
              <span>{item.id}</span>
            </div>
            <StatusBadge status={item.status} />
          </div>
          <div className="kpi-trend">{t.stage}: {item.stage}</div>
          <ProgressBar percentage={item.progress} tone="mint" label={`${item.progress}%`} />
          <dl className="employee-offboarding-details">
            <div><dt>{t.exitDate}</dt><dd>{formatDate(item.exitDate, language)}</dd></div>
            <div><dt>{t.offboardingReason}</dt><dd>{item.reason}</dd></div>
            {item.replacement && <div><dt>{t.replacement}</dt><dd>{item.replacement}</dd></div>}
          </dl>
          <p className="muted-note">{t.noOffboardingTasks}</p>
        </section>
      )) : (
        <section className="panel"><EmptyState title={t.noOffboarding} /></section>
      )}
    </div>
  )
}
