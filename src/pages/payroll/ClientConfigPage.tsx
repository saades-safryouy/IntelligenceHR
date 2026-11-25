import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/common/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { getClientConfig, updateClientConfig } from '../../data/payrollApi'
import type { ClientConfig } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import './Payroll.css'

type SeniorityBandDraft = { min_years: string; rate: string }

const EMPTY_BAND: SeniorityBandDraft = { min_years: '', rate: '' }

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function ClientConfigPage() {
  const { text: t } = useI18n()
  const [config, setConfig] = useState<ClientConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [legalName, setLegalName] = useState('')
  const [currency, setCurrency] = useState('MAD')
  const [languages, setLanguages] = useState('fr, ar')
  const [cnssNumber, setCnssNumber] = useState('')
  const [ice, setIce] = useState('')
  const [ifNumber, setIfNumber] = useState('')
  const [payDay, setPayDay] = useState('')
  const [cutOffDay, setCutOffDay] = useState('')
  const [amoPartial, setAmoPartial] = useState(false)
  const [bands, setBands] = useState<SeniorityBandDraft[]>([EMPTY_BAND])

  const applySettings = (settings: Record<string, unknown>) => {
    const company = asRecord(settings.company)
    const payroll = asRecord(settings.payroll)
    const statutory = asRecord(company.statutory_ids)
    setLegalName(asString(company.legal_name))
    setCurrency(asString(company.currency) || 'MAD')
    setLanguages(asStringArray(company.languages).join(', ') || 'fr, ar')
    setCnssNumber(asString(statutory.cnss_affiliation_number))
    setIce(asString(statutory.ice))
    setIfNumber(asString(statutory.if))
    setPayDay(payroll.pay_day !== undefined && payroll.pay_day !== null ? String(payroll.pay_day) : '')
    setCutOffDay(payroll.cut_off_day !== undefined && payroll.cut_off_day !== null ? String(payroll.cut_off_day) : '')
    setAmoPartial(payroll.amo_partial_exemption === true)
    const rawBands = Array.isArray(payroll.seniority_bands) ? payroll.seniority_bands : []
    setBands(
      rawBands.length > 0
        ? rawBands.map((band) => {
            const record = asRecord(band)
            return { min_years: String(record.min_years ?? ''), rate: String(record.rate ?? '') }
          })
        : [EMPTY_BAND],
    )
  }

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const res = await getClientConfig()
      setConfig(res)
      if (res) applySettings(res.settings)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load the client configuration.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setFormError('')
    setSaving(true)
    try {
      const seniorityBands = bands
        .filter((band) => band.min_years !== '' && band.rate !== '')
        .map((band) => ({ min_years: Number(band.min_years), rate: Number(band.rate) }))
      const updated = await updateClientConfig({
        company: {
          legal_name: legalName || null,
          currency,
          languages: languages.split(',').map((item) => item.trim()).filter(Boolean),
          statutory_ids: {
            cnss_affiliation_number: cnssNumber || null,
            ice: ice || null,
            if: ifNumber || null,
          },
        },
        payroll: {
          pay_day: payDay === '' ? null : Number(payDay),
          cut_off_day: cutOffDay === '' ? null : Number(cutOffDay),
          amo_partial_exemption: amoPartial,
          seniority_bands: seniorityBands,
        },
      })
      setConfig(updated)
      applySettings(updated.settings)
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('Could not save the configuration.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={t('Client configuration')}
        subtitle={t('Company settings, payroll calendar and compensation policies. Saving creates a new version — runs created after the change use it, earlier runs keep their version.')}
      />

      {loadError ? <div className="payroll-error">{loadError}</div> : null}

      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>{t('Loading…')}</p>
      ) : (
        <div className="panel">
          <div className="panel-title">
            <h2>
              {t('Configuration')} {config ? `(v${config.version} · ${t('effective from')} ${config.effective_from ?? '—'})` : `(${t('no configuration yet')})`}
            </h2>
          </div>
          <div className="payroll-form">
            <div className="payroll-form-grid">
              <label>
                {t('Legal name')}
                <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </label>
              <label>
                {t('Currency')}
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </label>
              <label>
                {t('Languages (comma separated)')}
                <input value={languages} onChange={(e) => setLanguages(e.target.value)} />
              </label>
              <label>
                {t('CNSS affiliation number')}
                <input value={cnssNumber} onChange={(e) => setCnssNumber(e.target.value)} />
              </label>
              <label>
                {t('ICE')}
                <input value={ice} onChange={(e) => setIce(e.target.value)} />
              </label>
              <label>
                {t('IF (tax id)')}
                <input value={ifNumber} onChange={(e) => setIfNumber(e.target.value)} />
              </label>
              <label>
                {t('Pay day (day of month)')}
                <input type="number" min={1} max={31} value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder={t('Not set')} />
              </label>
              <label>
                {t('Cut-off day (overtime / bonus entry)')}
                <input type="number" min={1} max={31} value={cutOffDay} onChange={(e) => setCutOffDay(e.target.value)} placeholder={t('Not set')} />
              </label>
              <label>
                {t('AMO partial exemption (1.85% only)')}
                <select value={amoPartial ? 'yes' : 'no'} onChange={(e) => setAmoPartial(e.target.value === 'yes')}>
                  <option value="no">{t('No — full AMO 4.11% employer')}</option>
                  <option value="yes">{t('Yes — group medical cover already in place (art. 114)')}</option>
                </select>
              </label>
            </div>

            <div>
              <p className="payroll-section-title">{t('Seniority bonus — rate table by seniority band (D-09)')}</p>
              <p className="payroll-section-note">
                {t('The bonus is a percentage of the base salary, applied at calculation time from the hiring date. Leave the table empty for no seniority bonus. The statutory rule is unvalidated (V-09) — confirm it with the accountant before using it.')}
              </p>
              {bands.map((band, index) => (
                <div key={index} className="payroll-form-grid" style={{ marginBottom: 8 }}>
                  <label>
                    {t('From (years of service)')}
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={band.min_years}
                      onChange={(e) =>
                        setBands((current) => current.map((item, i) => (i === index ? { ...item, min_years: e.target.value } : item)))
                      }
                    />
                  </label>
                  <label>
                    {t('Rate (e.g. 0.05 = 5%)')}
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={band.rate}
                      onChange={(e) =>
                        setBands((current) => current.map((item, i) => (i === index ? { ...item, rate: e.target.value } : item)))
                      }
                    />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" className="button secondary" onClick={() => setBands((current) => current.filter((_, i) => i !== index))}>
                      {t('Remove')}
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="button secondary" onClick={() => setBands((current) => [...current, EMPTY_BAND])}>
                {t('Add a band')}
              </button>
            </div>

            {formError ? <div className="payroll-error">{formError}</div> : null}
            <div className="payroll-form-actions">
              <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
                {saving ? t('Saving…') : t('Save as a new version')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
