import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import { resolveEmployee, updateEmployeeProfile } from '../../data/employeeStore'
import { apiEmployeeRepository } from '../../data/apiEmployeeRepository'
import { isApiDataMode } from '../../lib/apiClient'
import { calculateProfileCompletion } from '../../utils/profileCompletion'
import { formatDate } from '../../utils/dates'
import { employeeDashboardTranslations } from './translations'
import { ProfileCard, ProgressBar } from './components'
import type { MaritalStatus } from '../../types/models'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import type { Employee } from '../../types/models'
import { EmployeeDocumentsPanel } from './EmployeeDocumentsPanel'

const MARITAL: MaritalStatus[] = ['Single', 'Married', 'Divorced', 'Widowed']

export function EmployeeProfilePage() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const t = employeeDashboardTranslations[language]
  const [params] = useSearchParams()
  const startEditing = params.get('edit') === '1'
  const showingDocuments = params.get('tab') === 'documents'
  const [employee, setEmployee] = useState<Employee | undefined>(() => isApiDataMode ? undefined : resolveEmployee(currentUser))
  const [editing, setEditing] = useState(startEditing)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isApiDataMode)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!isApiDataMode) return
    const employeeId = currentUser?.employeeId
    if (!employeeId) {
      setLoading(false)
      setError(t.notFound)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    apiEmployeeRepository.get(employeeId)
      .then((record) => {
        if (!record) throw new Error(t.notFound)
        if (active) setEmployee(record)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : t.loadFailed)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [currentUser?.employeeId, reload, t.loadFailed, t.notFound])

  if (loading) {
    return <div className="page employee-page"><div className="empty-block" role="status">{t.loading}</div></div>
  }

  if (!employee) {
    return (
      <div className="page employee-profile-page">
        {error ? <div className="toast-inline toast-error" role="alert">{error}</div> : <div className="empty-block">{t.notFound}</div>}
        {isApiDataMode && error !== t.notFound && (
          <button className="button secondary" onClick={() => setReload((value) => value + 1)}>{t.tryAgain}</button>
        )}
      </div>
    )
  }

  if (showingDocuments) {
    return (
      <div className="page employee-page employee-profile-page">
        <PageHeader eyebrow={t.employeePortal} title={t.profileTitle} subtitle={t.profileSubtitle}>
          <Link to="/employee/profile?tab=profile" className="button secondary">{t.profileDetailsTab}</Link>
          <Link to="/employee/documents" className="button primary">{t.navDocuments}</Link>
        </PageHeader>
        {isApiDataMode
          ? <EmployeeDocumentsPanel employeeId={employee.id} />
          : <section className="panel"><div className="empty-state" role="status">{t.noDocuments}</div></section>}
      </div>
    )
  }

  const { percentage, missing } = calculateProfileCompletion(employee)

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const personalPhone = String(data.get('personalPhone') || '').trim()
    const professionalPhone = String(data.get('professionalPhone') || '').trim()
    const maritalStatus = String(data.get('maritalStatus') || employee.maritalStatus) as MaritalStatus
    const numberOfChildren = Number(data.get('numberOfChildren') ?? employee.numberOfChildren)
    const emergencyContactName = String(data.get('emergencyContactName') || '').trim()
    const emergencyContactPhone = String(data.get('emergencyContactPhone') || '').trim()
    const emergencyContactRelationship = String(data.get('emergencyContactRelationship') || '').trim()

    if (!personalPhone || !professionalPhone) {
      setError(t.completeYourProfile)
      return
    }
    if (Number.isNaN(numberOfChildren) || numberOfChildren < 0) {
      setError(t.completeYourProfile)
      return
    }

    setSaving(true)
    const next = {
      personalPhone,
      professionalPhone,
      maritalStatus,
      numberOfChildren,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      emergencyContactRelationship: emergencyContactRelationship || null,
    }
    const completed =
      personalPhone &&
      professionalPhone &&
      maritalStatus &&
      numberOfChildren >= 0 &&
      emergencyContactName &&
      emergencyContactPhone &&
      emergencyContactRelationship
        ? new Date().toISOString()
        : employee.personalInfoCompletedAt

    try {
      const updated = isApiDataMode
        ? await apiEmployeeRepository.update(employee.id, next)
        : updateEmployeeProfile(employee.userId, { ...next, personalInfoCompletedAt: completed })
      if (!updated) throw new Error(t.saveFailed)
      setEmployee(updated)
      setEditing(false)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page employee-page employee-profile-page">
      <PageHeader eyebrow={t.employeePortal} title={t.profileTitle} subtitle={t.profileSubtitle}>
        <Link to="/employee/profile?tab=documents" className="button secondary">{t.profileDocumentsTab}</Link>
        <Link to="/employee/dashboard" className="button secondary">
          {t.navDashboard}
        </Link>
        {!editing && (
          <button className="button primary" onClick={() => { setEditing(true); setSaved(false) }}>
            {t.editProfile}
          </button>
        )}
      </PageHeader>

      {saved && <div className="toast-inline" role="status">{t.savedSuccess}</div>}
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}

      <section className="panel profile-meter-panel profile-completion-card">
        <div className="panel-title">
          <div>
            <h2>{t.profileCompletion}</h2>
            <span>{percentage === 100 ? t.profileComplete : t.completeYourProfile}</span>
          </div>
          <strong>{percentage}%</strong>
        </div>
        <ProgressBar percentage={percentage} tone={percentage === 100 ? 'mint' : 'orange'} label={`${percentage}%`} />
        {missing.length > 0 && (
          <p className="missing-fields">
            {missing.map((field) => t[field as keyof typeof t] || field).join(' · ')}
          </p>
        )}
        {employee.personalInfoCompletedAt && percentage === 100 && (
          <p className="missing-fields">
            {t.completedOn} {formatDate(employee.personalInfoCompletedAt, language)}
          </p>
        )}
      </section>

      {editing ? (
        <section className="panel profile-edit-card">
          <form className="leave-form profile-form" onSubmit={onSave}>
            <h4 className="profile-form-heading">{t.contact}</h4>
            <label>
              {t.personalPhone}
              <input name="personalPhone" type="tel" autoComplete="tel" defaultValue={employee.personalPhone ?? ''} required />
            </label>
            <label>
              {t.professionalPhone}
              <input name="professionalPhone" type="tel" defaultValue={employee.professionalPhone ?? ''} required />
            </label>
            <label>
              {t.email}
              <input type="email" autoComplete="email" value={employee.email} disabled readOnly />
            </label>

            <h4 className="profile-form-heading">{t.family}</h4>
            <label>
              {t.maritalStatus}
              <select name="maritalStatus" defaultValue={employee.maritalStatus ?? ''}>
                {MARITAL.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.numberOfChildren}
              <input name="numberOfChildren" type="number" min={0} step={1} defaultValue={employee.numberOfChildren ?? ''} required />
            </label>
            <label>
              {t.emergencyContactName}
              <input name="emergencyContactName" defaultValue={employee.emergencyContactName ?? ''} />
            </label>
            <label>
              {t.emergencyContactPhone}
              <input name="emergencyContactPhone" defaultValue={employee.emergencyContactPhone ?? ''} />
            </label>
            <label>
              {t.emergencyContactRelationship}
              <input name="emergencyContactRelationship" defaultValue={employee.emergencyContactRelationship ?? ''} />
            </label>

            <div className="leave-form-actions profile-form-actions">
              <button type="button" className="button secondary" onClick={() => setEditing(false)}>
                {t.cancel}
              </button>
              <button type="submit" className="button primary" disabled={saving}>
                {saving ? t.saving : t.saveChanges}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="panel profile-details-card">
          <ProfileCard employee={employee} t={t} language={language} />
        </section>
      )}
    </div>
  )
}
