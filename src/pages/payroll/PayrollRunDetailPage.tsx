import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { useI18n } from '../../contexts/I18nContext'
import { employeeRepository } from '../../data/mockRepository'
import type { Employee } from '../../types/models'
import {
  approveRun,
  calculateRun,
  closeRun,
  formatDH,
  getRun,
  listRunPayslips,
  periodLabel,
  sendBackRun,
  validateRun,
} from '../../data/payrollApi'
import type { PayrollPayslip, RunDetail } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import { PayslipCalculationDetail } from './PayslipCalculation'
import './Payroll.css'

type OvertimeEntry = { normal: string; night: string; holiday: string }

const EMPTY_OVERTIME: OvertimeEntry = { normal: '', night: '', holiday: '' }

export function PayrollRunDetailPage() {
  const { text: t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const runId = Number(id)
  const [run, setRun] = useState<RunDetail | null>(null)
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [acting, setActing] = useState(false)
  const [expandedPayslip, setExpandedPayslip] = useState<number | null>(null)
  const [overtime, setOvertime] = useState<Record<number, OvertimeEntry>>({})
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')
  const [overrides, setOverrides] = useState<Record<number, string>>({})

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [runRes, payslipsRes, employeesRes] = await Promise.all([
        getRun(runId),
        listRunPayslips(runId, 1, 100),
        employeeRepository.list({ pageSize: 100 }),
      ])
      setRun(runRes)
      setPayslips(payslipsRes.data)
      setEmployees(employeesRes.data)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load the run.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const refresh = async () => {
    try {
      const [runRes, payslipsRes] = await Promise.all([getRun(runId), listRunPayslips(runId, 1, 100)])
      setRun(runRes)
      setPayslips(payslipsRes.data)
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : t('Could not refresh the run.'))
    }
  }

  const doAction = async (action: () => Promise<RunDetail>, onDone?: () => void) => {
    setActionError('')
    setActing(true)
    try {
      const updated = await action()
      setRun(updated)
      await refresh()
      onDone?.()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : t('The action failed.'))
    } finally {
      setActing(false)
    }
  }

  const inScopeEmployees = run
    ? run.scope_type === 'department'
      ? employees.filter((employee) => employee.departmentId === run.scope_id)
      : employees
    : []

  const totals = run?.totals ?? null
  const validation = run?.validation
  const minWageChecks = (validation?.blocking ?? []).filter((check) => check.code === 'minimum_wage.below')

  const buildOvertimePayload = () => {
    const payload: Record<string, { normal_hours?: number; night_hours?: number; holiday_hours?: number }> = {}
    for (const [employeeId, entry] of Object.entries(overtime)) {
      const normal = Number(entry.normal) || 0
      const night = Number(entry.night) || 0
      const holiday = Number(entry.holiday) || 0
      if (normal > 0 || night > 0 || holiday > 0) {
        payload[employeeId] = { normal_hours: normal, night_hours: night, holiday_hours: holiday }
      }
    }
    return payload
  }

  if (isLoading) {
    return (
      <div className="page">
        <p style={{ color: 'var(--muted)' }}>{t('Loading…')}</p>
      </div>
    )
  }

  if (loadError || !run) {
    return (
      <div className="page">
        <div className="payroll-error">{loadError || t('Run not found.')}</div>
        <Link className="button secondary" to="/app/payroll">
          {t('Back to payroll')}
        </Link>
      </div>
    )
  }

  const canCalculate = run.status === 'draft' || run.status === 'calculated'
  const canValidate = run.status === 'calculated'
  const canApprove = run.status === 'validated'
  const canClose = run.status === 'approved'
  const canSendBack = run.status !== 'closed'

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={`${t('Payroll run')} ${periodLabel(run.period_year, run.period_month)}`}
        subtitle={`${run.scope_type === 'department' ? `${t('Department')} ${run.scope_id ?? ''}` : t('All employees')} · ${run.jurisdiction_code ?? 'MA'} v${run.jurisdiction_profile_version ?? ''}`}
      >
        <StatusBadge status={run.status} label={t(run.status)} />
      </PageHeader>

      {actionError ? <div className="payroll-error">{actionError}</div> : null}

      {totals?.last_send_back_reason ? (
        <div className="payroll-banner">
          <div>
            <strong>{t('Sent back')}</strong>
            {totals.last_send_back_reason}
          </div>
        </div>
      ) : null}

      {totals ? (
        <div className="payroll-totals">
          <div>
            <span>{t('Gross')}</span>
            <strong>{formatDH(totals.gross_total)}</strong>
            <small>
              {(totals.employees_calculated ?? 0)} {t('payslips')}
            </small>
          </div>
          <div>
            <span>{t('Net pay')}</span>
            <strong>{formatDH(totals.net_total)}</strong>
            <small>{t('Paid to employees')}</small>
          </div>
          <div>
            <span>{t('Income tax')}</span>
            <strong>{formatDH(totals.tax_total)}</strong>
            <small>{t('Withheld (IR)')}</small>
          </div>
          <div>
            <span>{t('Employee contributions')}</span>
            <strong>{formatDH(totals.employee_contributions_total)}</strong>
            <small>{t('CNSS + AMO')}</small>
          </div>
          <div>
            <span>{t('Employer contributions')}</span>
            <strong>{formatDH(totals.employer_contributions_total)}</strong>
            <small>{t('CNSS + AMO + TFP')}</small>
          </div>
          <div>
            <span>{t('Employer cost')}</span>
            <strong>{formatDH(totals.employer_cost_total)}</strong>
            <small>{t('HR reports only')}</small>
          </div>
        </div>
      ) : (
        <div className="payroll-empty">{t('This run has not been calculated yet. Enter overtime below, then calculate.')}</div>
      )}

      <div className="panel">
        <div className="panel-title">
          <h2>{t('Run actions')}</h2>
        </div>
        <p className="payroll-section-note">
          {t('Draft → Calculated → Validated → Approved → Closed. Approval needs a different hr-admin than the one who calculated or validated the run.')}
        </p>
        <div className="payroll-actions">
          {canCalculate ? (
            <button
              type="button"
              className="button primary"
              disabled={acting}
              onClick={() => void doAction(() => calculateRun(runId, buildOvertimePayload()))}
            >
              {acting ? t('Calculating…') : t('Calculate')}
            </button>
          ) : null}
          {canValidate ? (
            <button
              type="button"
              className="button primary"
              disabled={acting}
              onClick={() =>
                void doAction(() =>
                  validateRun(
                    runId,
                    Object.fromEntries(Object.entries(overrides).filter(([, reason]) => reason.trim() !== '')),
                  ),
                )
              }
            >
              {acting ? t('Validating…') : t('Validate')}
            </button>
          ) : null}
          {canApprove ? (
            <button type="button" className="button primary" disabled={acting} onClick={() => void doAction(() => approveRun(runId))}>
              {acting ? t('Approving…') : t('Approve')}
            </button>
          ) : null}
          {canClose ? (
            <button type="button" className="button primary" disabled={acting} onClick={() => void doAction(() => closeRun(runId))}>
              {acting ? t('Closing…') : t('Close run')}
            </button>
          ) : null}
          {canSendBack ? (
            <button type="button" className="button secondary" disabled={acting} onClick={() => setSendBackOpen((open) => !open)}>
              {t('Send back')}
            </button>
          ) : null}
          <Link className="button secondary" to="/app/payroll" style={{ textDecoration: 'none' }}>
            {t('Back to runs')}
          </Link>
        </div>
        {sendBackOpen && canSendBack ? (
          <div className="payroll-form" style={{ marginTop: 14 }}>
            <label>
              {t('Send-back reason')}
              <textarea value={sendBackReason} onChange={(e) => setSendBackReason(e.target.value)} placeholder={t('Why is this run sent back?')} />
            </label>
            <div className="payroll-form-actions">
              <button
                type="button"
                className="button primary"
                disabled={acting || sendBackReason.trim() === ''}
                onClick={() =>
                  void doAction(() => sendBackRun(runId, sendBackReason.trim()), () => {
                    setSendBackOpen(false)
                    setSendBackReason('')
                  })
                }
              >
                {t('Send back to draft')}
              </button>
              <button type="button" className="button secondary" onClick={() => setSendBackOpen(false)}>
                {t('Cancel')}
              </button>
            </div>
          </div>
        ) : null}
        {run.status === 'closed' ? (
          <p className="payroll-section-note" style={{ marginTop: 14, marginBottom: 0 }}>
            {t('This run is closed. Payslips are visible to employees. Corrections go through a rectifying run.')}
          </p>
        ) : null}
      </div>

      {validation ? (
        <div className="panel">
          <div className="panel-title">
            <h2>
              {t('Validation checks')} ({validation.employees_checked} {t('employees')}, {validation.payslips_checked} {t('payslips')})
            </h2>
          </div>
          {validation.blocking.length === 0 && validation.warnings.length === 0 ? (
            <div className="payroll-empty">{t('No blocking checks and no warnings.')}</div>
          ) : (
            <div className="payroll-checks">
              {validation.blocking.map((check, index) => (
                <div key={`blocking-${index}`} className="payroll-check blocking">
                  <code>{check.code}</code>
                  <span>{check.message}</span>
                </div>
              ))}
              {validation.warnings.map((check, index) => (
                <div key={`warning-${index}`} className="payroll-check warning">
                  <code>{check.code}</code>
                  <span>{check.message}</span>
                </div>
              ))}
            </div>
          )}
          {minWageChecks.length > 0 ? (
            <div className="payroll-form" style={{ marginTop: 14 }}>
              <p className="payroll-section-note" style={{ marginBottom: 0 }}>
                {t('Minimum-wage breaches can be validated with an override reason per employee (FR-10).')}
              </p>
              {minWageChecks.map((check) => (
                <label key={check.employee_id}>
                  {t('Override reason for')} {check.employee_name ?? check.employee_id}
                  <input
                    value={check.employee_id !== undefined ? overrides[check.employee_id] ?? '' : ''}
                    onChange={(e) =>
                      check.employee_id !== undefined &&
                      setOverrides((current) => ({ ...current, [check.employee_id as number]: e.target.value }))
                    }
                    placeholder={t('e.g. part-time contract, unpaid leave')}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canCalculate ? (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-title" style={{ padding: '19px 20px 0' }}>
            <h2>{t('Overtime (manual entry)')}</h2>
          </div>
          <p className="payroll-section-note" style={{ padding: '0 20px' }}>
            {t('Overtime is entered manually on the run (D-10). The hourly rate is the base salary divided by the contractual hours. Leave a row empty for no overtime.')}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>{t('Employee')}</th>
                  <th className="num">{t('Day hours')}</th>
                  <th className="num">{t('Night hours')}</th>
                  <th className="num">{t('Holiday hours')}</th>
                </tr>
              </thead>
              <tbody>
                {inScopeEmployees.map((employee) => {
                  const entry = overtime[employee.id] ?? EMPTY_OVERTIME
                  const set = (field: keyof OvertimeEntry, value: string) =>
                    setOvertime((current) => ({ ...current, [employee.id]: { ...(current[employee.id] ?? EMPTY_OVERTIME), [field]: value } }))
                  return (
                    <tr key={employee.id}>
                      <td>
                        {employee.firstName} {employee.lastName}
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          style={{ width: 90, height: 32 }}
                          value={entry.normal}
                          onChange={(e) => set('normal', e.target.value)}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          style={{ width: 90, height: 32 }}
                          value={entry.night}
                          onChange={(e) => set('night', e.target.value)}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          style={{ width: 90, height: 32 }}
                          value={entry.holiday}
                          onChange={(e) => set('holiday', e.target.value)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-title" style={{ padding: '19px 20px 0' }}>
          <h2>
            {t('Payslips')} ({payslips.length})
          </h2>
        </div>
        {payslips.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-empty">{t('No payslips yet — calculate the run first.')}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>{t('Employee')}</th>
                  <th className="num">{t('Gross')}</th>
                  <th className="num">{t('Employee contributions')}</th>
                  <th className="num">{t('Income tax')}</th>
                  <th className="num">{t('Net pay')}</th>
                  <th className="num">{t('Employer cost')}</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((payslip) => (
                  <Fragment key={payslip.id}>
                    <tr onClick={() => setExpandedPayslip((current) => (current === payslip.id ? null : payslip.id))}>
                      <td>{payslip.employee_name ?? `#${payslip.employee_id}`}</td>
                      <td className="num">{formatDH(payslip.gross)}</td>
                      <td className="num">{formatDH(payslip.calculation.computation?.contributions?.employee?.total)}</td>
                      <td className="num">{formatDH(payslip.calculation.computation?.tax?.amount)}</td>
                      <td className="num">{formatDH(payslip.net)}</td>
                      <td className="num">{formatDH(payslip.employer_cost)}</td>
                    </tr>
                    {expandedPayslip === payslip.id ? (
                      <tr className="expanded-row">
                        <td colSpan={6}>
                          <PayslipCalculationDetail calculation={payslip.calculation} showEmployerCost />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
