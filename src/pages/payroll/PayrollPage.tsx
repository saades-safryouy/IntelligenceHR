import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { useI18n } from '../../contexts/I18nContext'
import { departmentRepository } from '../../data/mockRepository'
import type { Department } from '../../types/models'
import {
  createRun,
  formatDH,
  listJurisdictions,
  listRuns,
  monthName,
  periodLabel,
} from '../../data/payrollApi'
import type { JurisdictionRow, PayrollRun } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import './Payroll.css'

export function PayrollPage() {
  const { text: t } = useI18n()
  const navigate = useNavigate()
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRow[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [scopeType, setScopeType] = useState('all')
  const [scopeId, setScopeId] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async (nextPage = 1) => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [runsRes, jurisdictionsRes, deptRes] = await Promise.all([
        listRuns(nextPage, 20),
        listJurisdictions(),
        departmentRepository.list({ pageSize: 100 }),
      ])
      setRuns(runsRes.data)
      setTotal(runsRes.total)
      setPage(runsRes.page)
      setJurisdictions(jurisdictionsRes)
      setDepartments(deptRes.data)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load the payroll runs.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maJurisdiction = jurisdictions.find((row) => row.jurisdiction_code === 'MA')
  const maDisabled = maJurisdiction !== undefined && maJurisdiction.status !== 'enabled'

  const submit = async () => {
    setFormError('')
    setSaving(true)
    try {
      await createRun({
        period_year: year,
        period_month: month,
        jurisdiction_code: 'MA',
        scope_type: scopeType,
        scope_id: scopeType === 'department' ? scopeId : null,
      })
      setFormOpen(false)
      await load(1)
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('Could not create the run.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={t('Payroll')}
        subtitle={t('Monthly payroll runs for Morocco, from draft to closed.')}
      >
        <button type="button" className="button primary" onClick={() => setFormOpen(true)}>
          {t('Create run')}
        </button>
      </PageHeader>

      {maDisabled ? (
        <div className="payroll-banner">
          <div>
            <strong>{t('The Morocco profile is disabled for this tenant.')}</strong>
            {t(
              'Runs can be created but not calculated until a platform admin enables the MA profile. Calculation is never auto-enabled.',
            )}
          </div>
        </div>
      ) : null}

      <div className="payroll-banner info">
        <div>
          <strong>{t('Parameters are unvalidated.')}</strong>
          {t(
            'Every Moroccan rate is still awaiting accountant validation (V-01…V-15). Runs can be calculated and approved, but they cannot close until the parameters are validated.',
          )}{' '}
          <Link to="/app/payroll/parameters">{t('See the parameters')}</Link>
        </div>
      </div>

      {formOpen ? (
        <div className="panel">
          <div className="panel-title">
            <h2>{t('New payroll run')}</h2>
          </div>
          <div className="payroll-form">
            <div className="payroll-form-grid">
              <label>
                {t('Year')}
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </label>
              <label>
                {t('Month')}
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Scope')}
                <select
                  value={scopeType}
                  onChange={(e) => {
                    setScopeType(e.target.value)
                    setScopeId('')
                  }}
                >
                  <option value="all">{t('All employees')}</option>
                  <option value="department">{t('One department')}</option>
                </select>
              </label>
              {scopeType === 'department' ? (
                <label>
                  {t('Department')}
                  <select value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                    <option value="">{t('Choose a department')}</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                {t('Jurisdiction')}
                <input value="MA — Morocco (v2026.1)" readOnly />
              </label>
            </div>
            {formError ? <div className="payroll-error">{formError}</div> : null}
            <div className="payroll-form-actions">
              <button type="button" className="button primary" onClick={() => void submit()} disabled={saving || (scopeType === 'department' && !scopeId)}>
                {saving ? t('Creating…') : t('Create run')}
              </button>
              <button type="button" className="button secondary" onClick={() => setFormOpen(false)}>
                {t('Cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-title" style={{ padding: '19px 20px 0' }}>
          <h2>
            {t('Payroll runs')} ({total})
          </h2>
        </div>
        {isLoading ? (
          <p style={{ padding: '0 20px 20px', color: 'var(--muted)' }}>{t('Loading…')}</p>
        ) : loadError ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-error">{loadError}</div>
            <button type="button" className="button secondary" style={{ marginTop: 12 }} onClick={() => void load(page)}>
              {t('Retry')}
            </button>
          </div>
        ) : runs.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-empty">{t('No payroll runs yet. Create the first run for this month.')}</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="payroll-table">
                <thead>
                  <tr>
                    <th>{t('Period')}</th>
                    <th>{t('Scope')}</th>
                    <th>{t('Status')}</th>
                    <th className="num">{t('Payslips')}</th>
                    <th className="num">{t('Gross')}</th>
                    <th className="num">{t('Net')}</th>
                    <th>{t('Created by')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} onClick={() => navigate(`/app/payroll/runs/${run.id}`)}>
                      <td>
                        <Link to={`/app/payroll/runs/${run.id}`} onClick={(e) => e.stopPropagation()}>
                          {periodLabel(run.period_year, run.period_month)}
                        </Link>
                      </td>
                      <td>{run.scope_type === 'department' ? `${t('Department')} ${run.scope_id ?? ''}` : t('All employees')}</td>
                      <td>
                        <StatusBadge status={run.status} label={t(run.status)} />
                      </td>
                      <td className="num">{run.payslip_count}</td>
                      <td className="num">{run.totals ? formatDH(run.totals.gross_total) : '—'}</td>
                      <td className="num">{run.totals ? formatDH(run.totals.net_total) : '—'}</td>
                      <td>{run.created_by_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {t('Page')} {page}
              </span>
              <span>
                <button type="button" className="button secondary" disabled={page <= 1} onClick={() => void load(page - 1)}>
                  {t('Previous')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={runs.length < 20}
                  onClick={() => void load(page + 1)}
                >
                  {t('Next')}
                </button>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          <h2>{t('Payroll setup')}</h2>
        </div>
        <div className="payroll-tabs">
          <Link className="button secondary" to="/app/payroll/salary-structures" style={{ textDecoration: 'none' }}>
            {t('Salary structures')}
          </Link>
          <Link className="button secondary" to="/app/payroll/components" style={{ textDecoration: 'none' }}>
            {t('Components')}
          </Link>
          <Link className="button secondary" to="/app/payroll/parameters" style={{ textDecoration: 'none' }}>
            {t('Legal parameters')}
          </Link>
          <Link className="button secondary" to="/app/payroll/client-config" style={{ textDecoration: 'none' }}>
            {t('Client configuration')}
          </Link>
        </div>
      </div>
    </div>
  )
}
