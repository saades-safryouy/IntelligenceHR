import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/common/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { listJurisdictions, listParameters } from '../../data/payrollApi'
import type { JurisdictionRow, LegalParameter } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import './Payroll.css'

export function ParametersPage() {
  const { text: t } = useI18n()
  const [at, setAt] = useState(new Date().toISOString().slice(0, 10))
  const [parameters, setParameters] = useState<LegalParameter[]>([])
  // null until the first load resolves: the banner below must never
  // claim "All parameters validated" while the data is still loading
  // (the initial 0 did exactly that — a false "validated" flash on
  // every page load, and a stuck "validated" banner when the load
  // itself failed, since the count stayed 0).
  const [unvalidatedCount, setUnvalidatedCount] = useState<number | null>(null)
  const [profileVersion, setProfileVersion] = useState('')
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const load = async (date: string) => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [paramsRes, jurisdictionsRes] = await Promise.all([listParameters('MA', date), listJurisdictions()])
      setParameters(paramsRes.parameters)
      setUnvalidatedCount(paramsRes.unvalidated_count)
      setProfileVersion(paramsRes.profile_version)
      setJurisdictions(jurisdictionsRes)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load the parameters.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load(at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maJurisdiction = jurisdictions.find((row) => row.jurisdiction_code === 'MA')

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={t('Legal parameters')}
        subtitle={t('The Moroccan rates and rules the payroll engine reads. Read-only — a correction creates a new parameter version, it never edits a row in place.')}
      />

      {!isLoading && unvalidatedCount !== null ? (
        unvalidatedCount > 0 ? (
          <div className="payroll-banner danger">
            <div>
              <strong>
                {t('Unvalidated parameters — awaiting accountant validation')} ({unvalidatedCount}/{parameters.length})
              </strong>
              {t(
                'None of the validation items V-01…V-15 are confirmed yet. Runs can be calculated and approved, but they cannot close while their calculation used unvalidated parameters.',
              )}
            </div>
          </div>
        ) : (
          <div className="payroll-banner info">
            <div>
              <strong>{t('All parameters validated.')}</strong>
              {t('Every parameter in this set is official or confirmed. Runs may close.')}
            </div>
          </div>
        )
      ) : null}

      {maJurisdiction ? (
        <div className="panel">
          <div className="panel-title">
            <h2>
              {t('Morocco profile')} — MA v{profileVersion}
            </h2>
          </div>
          <p className="payroll-section-note" style={{ marginBottom: 0 }}>
            {t('Status')}: <strong>{maJurisdiction.status}</strong>
            {maJurisdiction.status !== 'enabled'
              ? ` — ${t('runs cannot be calculated until a platform admin enables the profile.')}`
              : ` — ${t('runs can be calculated.')}`}
          </p>
        </div>
      ) : null}

      <div className="panel">
        <div className="payroll-form">
          <label>
            {t('Valid at')}
            <input
              type="date"
              value={at}
              onChange={(e) => {
                setAt(e.target.value)
                void load(e.target.value)
              }}
            />
          </label>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-title" style={{ padding: '19px 20px 0' }}>
          <h2>
            {t('Parameters')} ({parameters.length})
          </h2>
        </div>
        {isLoading ? (
          <p style={{ padding: '0 20px 20px', color: 'var(--muted)' }}>{t('Loading…')}</p>
        ) : loadError ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-error">{loadError}</div>
            <button type="button" className="button secondary" style={{ marginTop: 12 }} onClick={() => void load(at)}>
              {t('Retry')}
            </button>
          </div>
        ) : parameters.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-empty">{t('No parameters for this date.')}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>{t('Key')}</th>
                  <th className="num">{t('Value')}</th>
                  <th>{t('Confidence')}</th>
                  <th>{t('Valid from')}</th>
                  <th>{t('Valid to')}</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((parameter) => (
                  <tr key={parameter.key}>
                    <td>{parameter.key}</td>
                    <td className="num">{parameter.value}</td>
                    <td>
                      <span className={`confidence-pill ${parameter.confidence ?? 'unknown'}`}>{parameter.confidence ?? t('unknown')}</span>
                    </td>
                    <td>{parameter.valid_from ?? '—'}</td>
                    <td>{parameter.valid_to ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
