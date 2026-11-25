import { Fragment, useEffect, useState } from 'react'
import { PageHeader } from '../../components/common/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { formatDH, listMyPayslips, periodLabel } from '../../data/payrollApi'
import type { PayrollPayslip } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import { PayslipCalculationDetail } from './PayslipCalculation'
import './Payroll.css'

/**
 * The employee's own payslips (§9.3 rule 4: only from CLOSED runs).
 * No PDF in P3 — the calculation summary is shown instead (P4
 * renders the FR + AR PDF from the same snapshot). Employer cost is
 * never shown here (D-07).
 */
export function MyPayslipsPage() {
  const { text: t } = useI18n()
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async (nextPage = 1) => {
    setIsLoading(true)
    setLoadError('')
    try {
      const res = await listMyPayslips(nextPage, 20)
      setPayslips(res.data)
      setTotal(res.total)
      setPage(res.page)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load your payslips.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={t('My payslips')}
        subtitle={t('Your payslips from closed payroll runs. The PDF payslip (French + Arabic) arrives in the next phase — the calculation summary below is the same data it will print.')}
      />

      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>{t('Loading…')}</p>
      ) : loadError ? (
        <div>
          <div className="payroll-error">{loadError}</div>
          <button type="button" className="button secondary" style={{ marginTop: 12 }} onClick={() => void load(page)}>
            {t('Retry')}
          </button>
        </div>
      ) : payslips.length === 0 ? (
        <div className="payroll-empty">
          {t('No payslips yet. Payslips appear here once a payroll run is closed.')}
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="panel-title" style={{ padding: '19px 20px 0' }}>
            <h2>
              {t('Payslips')} ({total})
            </h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>{t('Period')}</th>
                  <th className="num">{t('Gross')}</th>
                  <th className="num">{t('Employee contributions')}</th>
                  <th className="num">{t('Income tax')}</th>
                  <th className="num">{t('Net pay')}</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((payslip) => (
                  <Fragment key={payslip.id}>
                    <tr onClick={() => setExpanded((current) => (current === payslip.id ? null : payslip.id))}>
                      <td>{periodLabel(payslip.period_year, payslip.period_month)}</td>
                      <td className="num">{formatDH(payslip.gross)}</td>
                      <td className="num">{formatDH(payslip.calculation.computation?.contributions?.employee?.total)}</td>
                      <td className="num">{formatDH(payslip.calculation.computation?.tax?.amount)}</td>
                      <td className="num">{formatDH(payslip.net)}</td>
                    </tr>
                    {expanded === payslip.id ? (
                      <tr className="expanded-row">
                        <td colSpan={5}>
                          <PayslipCalculationDetail calculation={payslip.calculation} showEmployerCost={false} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
              <button type="button" className="button secondary" disabled={payslips.length < 20} onClick={() => void load(page + 1)}>
                {t('Next')}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
