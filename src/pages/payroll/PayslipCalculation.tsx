import { formatDH } from '../../data/payrollApi'
import type { PayslipCalculation } from '../../data/payrollApi'
import { useI18n } from '../../contexts/I18nContext'

/**
 * Read-only breakdown of a payslip's calculation snapshot (§7.8).
 * Shared by the run detail page (HR) and the employee's own payslips
 * page. Employer cost is shown here only when `showEmployerCost` is
 * set — it never appears on the employee payslip (D-07).
 */
export function PayslipCalculationDetail({
  calculation,
  showEmployerCost,
}: {
  calculation: PayslipCalculation
  showEmployerCost: boolean
}) {
  const { text: t } = useI18n()
  const computation = calculation.computation ?? {}
  const employeeBranches = computation.contributions?.employee?.by_branch ?? {}
  const employerBranches = computation.contributions?.employer?.by_branch ?? {}
  const lines = calculation.inputs?.lines ?? []
  const abatements = computation.taxable_income?.abatements ?? []
  const taxDetails = computation.tax?.details ?? {}
  const warnings = calculation.warnings ?? []

  const branchLabel = (key: string) =>
    ({
      cnss_family: t('CNSS family allowances'),
      cnss_short_term: t('CNSS short-term'),
      cnss_long_term: t('CNSS pension'),
      amo: t('AMO health insurance'),
      tfp: t('Vocational training tax'),
    })[key] ?? key

  return (
    <div className="payroll-detail">
      <div>
        <h4>{t('Pay components')}</h4>
        <dl>
          <dt>{t('Base salary')}</dt>
          <dd>{formatDH(calculation.inputs?.base_salary)}</dd>
          {lines.map((line, index) => (
            <div key={`${line.component ?? 'line'}-${index}`} style={{ display: 'contents' }}>
              <dt>{line.component ?? t('Component')}</dt>
              <dd>{formatDH(line.amount)}</dd>
            </div>
          ))}
          {calculation.inputs?.overtime &&
            (calculation.inputs.overtime.normal_hours ||
              calculation.inputs.overtime.night_hours ||
              calculation.inputs.overtime.holiday_hours) ? (
              <>
                <dt>{t('Overtime')}</dt>
                <dd>
                  {[
                    calculation.inputs.overtime.normal_hours
                      ? `${calculation.inputs.overtime.normal_hours}h ${t('day')}`
                      : null,
                    calculation.inputs.overtime.night_hours
                      ? `${calculation.inputs.overtime.night_hours}h ${t('night')}`
                      : null,
                    calculation.inputs.overtime.holiday_hours
                      ? `${calculation.inputs.overtime.holiday_hours}h ${t('holiday')}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </>
            ) : null}
          <dt>{t('Gross')}</dt>
          <dd>{formatDH(computation.gross)}</dd>
          <dt>{t('Social base')}</dt>
          <dd>{formatDH(computation.social_base)}</dd>
          <dt>{t('Tax base')}</dt>
          <dd>{formatDH(computation.tax_base)}</dd>
        </dl>
      </div>

      <div>
        <h4>{t('Employee contributions')}</h4>
        <dl>
          {Object.entries(employeeBranches).map(([key, amount]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{branchLabel(key)}</dt>
              <dd>{formatDH(amount)}</dd>
            </div>
          ))}
          <dt>{t('Total employee contributions')}</dt>
          <dd>{formatDH(computation.contributions?.employee?.total)}</dd>
          <dt>{t('Taxable income')}</dt>
          <dd>{formatDH(computation.taxable_income?.net_taxable)}</dd>
          {abatements.map((abatement, index) => (
            <div key={`${abatement.key ?? 'abatement'}-${index}`} style={{ display: 'contents' }}>
              <dt>{t('Abatement')}</dt>
              <dd>−{formatDH(abatement.amount)}</dd>
            </div>
          ))}
          <dt>{t('Income tax')}</dt>
          <dd>{formatDH(computation.tax?.amount)}</dd>
          {typeof taxDetails.family_reduction_month === 'number' && taxDetails.family_reduction_month > 0 ? (
            <>
              <dt>{t('Family reduction')}</dt>
              <dd>−{formatDH(Number(taxDetails.family_reduction_month))}</dd>
            </>
          ) : null}
          <dt>{t('Net pay')}</dt>
          <dd>{formatDH(computation.net)}</dd>
          {showEmployerCost ? (
            <>
              <dt>{t('Employer cost')}</dt>
              <dd>{formatDH(computation.employer_cost)}</dd>
            </>
          ) : null}
        </dl>
      </div>

      {showEmployerCost && Object.keys(employerBranches).length > 0 ? (
        <div>
          <h4>{t('Employer contributions')}</h4>
          <dl>
            {Object.entries(employerBranches).map(([key, amount]) => (
              <div key={key} style={{ display: 'contents' }}>
                <dt>{branchLabel(key)}</dt>
                <dd>{formatDH(amount)}</dd>
              </div>
            ))}
            <dt>{t('Total employer contributions')}</dt>
            <dd>{formatDH(computation.contributions?.employer?.total)}</dd>
          </dl>
        </div>
      ) : null}

      <div>
        <h4>{t('Year to date')}</h4>
        <dl>
          <dt>{t('Gross')}</dt>
          <dd>{formatDH(calculation.ytd?.gross)}</dd>
          <dt>{t('Employee contributions')}</dt>
          <dd>{formatDH(calculation.ytd?.cnss_employee)}</dd>
          <dt>{t('Income tax')}</dt>
          <dd>{formatDH(calculation.ytd?.ir)}</dd>
        </dl>
        {warnings.length > 0 ? (
          <p style={{ color: 'var(--orange)', fontSize: 11, margin: '10px 0 0' }}>
            {warnings.map((warning) => warning.code ?? 'warning').join(', ')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
