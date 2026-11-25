import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/common/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { createComponent, formatDH, listComponents, updateComponent } from '../../data/payrollApi'
import type { PayrollComponent } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import './Payroll.css'

const CATEGORIES = ['earning', 'allowance', 'bonus', 'deduction', 'benefit']
const CAP_TYPES = ['none', 'fixed_period', 'fixed_amount', 'percentage', 'smig_multiple']

export function ComponentsPage() {
  const { text: t } = useI18n()
  const [components, setComponents] = useState<PayrollComponent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PayrollComponent | null>(null)
  const [code, setCode] = useState('')
  const [nameFr, setNameFr] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [category, setCategory] = useState('allowance')
  const [cnssSubject, setCnssSubject] = useState(true)
  const [irSubject, setIrSubject] = useState(true)
  const [capType, setCapType] = useState('none')
  const [capValue, setCapValue] = useState('')
  const [active, setActive] = useState(true)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      setComponents(await listComponents())
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load the components.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreate = () => {
    setEditing(null)
    setCode('')
    setNameFr('')
    setNameAr('')
    setNameEn('')
    setCategory('allowance')
    setCnssSubject(true)
    setIrSubject(true)
    setCapType('none')
    setCapValue('')
    setActive(true)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (component: PayrollComponent) => {
    setEditing(component)
    setCode(component.code)
    setNameFr(component.name_fr ?? '')
    setNameAr(component.name_ar ?? '')
    setNameEn(component.name_en ?? '')
    setCategory(component.category)
    setCnssSubject(component.cnss_subject)
    setIrSubject(component.ir_subject)
    setCapType(component.cap_type ?? 'none')
    setCapValue(component.cap_value !== null ? String(component.cap_value) : '')
    setActive(component.active)
    setFormError('')
    setFormOpen(true)
  }

  const save = async () => {
    setFormError('')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name_fr: nameFr || null,
        name_ar: nameAr || null,
        name_en: nameEn || null,
        category,
        cnss_subject: cnssSubject,
        ir_subject: irSubject,
        cap_type: capType,
        cap_value: capValue === '' ? null : Number(capValue),
        active,
      }
      if (editing === null) {
        payload.code = code
        await createComponent(payload)
      } else {
        await updateComponent(editing.id, payload)
      }
      setFormOpen(false)
      await load()
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('Could not save the component.'))
    } finally {
      setSaving(false)
    }
  }

  const isSystem = editing?.is_system ?? false

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={t('Components')}
        subtitle={t('The salary-component catalog. Components are never deleted — deactivate them instead, so past structure lines keep their meaning.')}
      >
        <button type="button" className="button primary" onClick={openCreate}>
          {t('New component')}
        </button>
      </PageHeader>

      {loadError ? <div className="payroll-error">{loadError}</div> : null}

      {formOpen ? (
        <div className="panel">
          <div className="panel-title">
            <h2>{editing === null ? t('New component') : t('Edit component')}</h2>
          </div>
          {isSystem ? (
            <div className="payroll-banner info" style={{ marginBottom: 14 }}>
              <div>
                <strong>{t('System component')}</strong>
                {t('Base salary and overtime are system components: their code, category, treatment flags and cap cannot change. Only names, the active flag and effective dates may change.')}
              </div>
            </div>
          ) : null}
          <div className="payroll-form">
            <div className="payroll-form-grid">
              <label>
                {t('Code')}
                <input value={code} disabled={editing !== null} onChange={(e) => setCode(e.target.value)} placeholder="transport" />
              </label>
              <label>
                {t('Name (French)')}
                <input value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
              </label>
              <label>
                {t('Name (Arabic)')}
                <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
              </label>
              <label>
                {t('Name (English)')}
                <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              </label>
              <label>
                {t('Category')}
                <select value={category} disabled={isSystem} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Cap type')}
                <select value={capType} disabled={isSystem} onChange={(e) => setCapType(e.target.value)}>
                  {CAP_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Cap value')}
                <input type="number" min={0} step={0.01} value={capValue} disabled={isSystem} onChange={(e) => setCapValue(e.target.value)} />
              </label>
              <label>
                {t('Active')}
                <select value={active ? 'yes' : 'no'} onChange={(e) => setActive(e.target.value === 'yes')}>
                  <option value="yes">{t('Yes')}</option>
                  <option value="no">{t('No')}</option>
                </select>
              </label>
            </div>
            <div className="payroll-form-grid">
              <label>
                {t('Subject to CNSS')}
                <select value={cnssSubject ? 'yes' : 'no'} disabled={isSystem} onChange={(e) => setCnssSubject(e.target.value === 'yes')}>
                  <option value="yes">{t('Yes')}</option>
                  <option value="no">{t('No')}</option>
                </select>
              </label>
              <label>
                {t('Subject to income tax')}
                <select value={irSubject ? 'yes' : 'no'} disabled={isSystem} onChange={(e) => setIrSubject(e.target.value === 'yes')}>
                  <option value="yes">{t('Yes')}</option>
                  <option value="no">{t('No')}</option>
                </select>
              </label>
            </div>
            {formError ? <div className="payroll-error">{formError}</div> : null}
            <div className="payroll-form-actions">
              <button type="button" className="button primary" onClick={() => void save()} disabled={saving || (editing === null && code.trim() === '')}>
                {saving ? t('Saving…') : t('Save')}
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
            {t('Catalog')} ({components.length})
          </h2>
        </div>
        {isLoading ? (
          <p style={{ padding: '0 20px 20px', color: 'var(--muted)' }}>{t('Loading…')}</p>
        ) : components.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-empty">{t('The catalog is empty.')}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>{t('Code')}</th>
                  <th>{t('Name')}</th>
                  <th>{t('Category')}</th>
                  <th>{t('CNSS')}</th>
                  <th>{t('Tax')}</th>
                  <th>{t('Cap')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {components.map((component) => (
                  <tr key={component.id}>
                    <td>{component.code}</td>
                    <td>{component.name_en ?? component.name_fr ?? component.name_ar ?? '—'}</td>
                    <td>{component.category}</td>
                    <td>{component.cnss_subject ? t('Yes') : t('No')}</td>
                    <td>{component.ir_subject ? t('Yes') : t('No')}</td>
                    <td>
                      {component.cap_type === 'none' || component.cap_type === null
                        ? '—'
                        : `${component.cap_type} ${component.cap_value !== null ? formatDH(component.cap_value) : ''}`}
                    </td>
                    <td>
                      {component.is_system ? (
                        <span className="confidence-pill unknown">{t('System')}</span>
                      ) : component.suggested_by_profile ? (
                        <span className="confidence-pill unknown">{component.suggested_by_profile}</span>
                      ) : null}{' '}
                      {component.active ? t('Active') : t('Inactive')}
                    </td>
                    <td>
                      <button type="button" className="button secondary" onClick={() => openEdit(component)}>
                        {t('Edit')}
                      </button>
                    </td>
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
