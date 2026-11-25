import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/common/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { employeeRepository } from '../../data/mockRepository'
import type { Employee } from '../../types/models'
import {
  createStructure,
  formatDH,
  listComponents,
  listStructures,
  updateStructure,
} from '../../data/payrollApi'
import type { PayrollComponent, SalaryStructure, SalaryStructureLine } from '../../data/payrollApi'
import { ApiError } from '../../lib/apiClient'
import './Payroll.css'

type LineDraft = { component_code: string; amount: string }

const EMPTY_LINE: LineDraft = { component_code: '', amount: '' }

export function SalaryStructuresPage() {
  const { text: t } = useI18n()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState<number | ''>('')
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [components, setComponents] = useState<PayrollComponent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [baseSalary, setBaseSalary] = useState('10000')
  const [contractualHours, setContractualHours] = useState('191')
  const [employmentType, setEmploymentType] = useState('Full-time')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([EMPTY_LINE])
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadStructures = async (forEmployee: number | '') => {
    setIsLoading(true)
    setLoadError('')
    try {
      const res = await listStructures(forEmployee === '' ? undefined : forEmployee)
      setStructures(res)
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : t('Could not load the salary structures.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [employeesRes, componentsRes] = await Promise.all([
          employeeRepository.list({ pageSize: 100 }),
          listComponents(),
        ])
        setEmployees(employeesRes.data)
        setComponents(componentsRes.filter((component) => component.active))
      } catch (error) {
        setLoadError(error instanceof ApiError ? error.message : t('Could not load the salary structures.'))
      } finally {
        setIsLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadStructures(employeeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId])

  const openCreate = () => {
    if (employeeId === '') {
      setFormError(t('Choose an employee first.'))
      return
    }
    setEditingId(null)
    setBaseSalary('10000')
    setContractualHours('191')
    setEmploymentType('Full-time')
    setEffectiveFrom(new Date().toISOString().slice(0, 10))
    setNotes('')
    setLines([EMPTY_LINE])
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (structure: SalaryStructure) => {
    setEditingId(structure.id)
    setEmployeeId(structure.employee_id)
    setBaseSalary(String(structure.base_salary))
    setContractualHours(String(structure.contractual_hours_month ?? 191))
    setEmploymentType(structure.employment_type ?? 'Full-time')
    setEffectiveFrom(new Date().toISOString().slice(0, 10))
    setNotes(structure.notes ?? '')
    setLines(
      structure.lines.length > 0
        ? structure.lines.map((line: SalaryStructureLine) => ({ component_code: line.component_code, amount: String(line.amount) }))
        : [EMPTY_LINE],
    )
    setFormError('')
    setFormOpen(true)
  }

  const save = async () => {
    if (employeeId === '') return
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        employee_id: employeeId,
        base_salary: Number(baseSalary),
        contractual_hours_month: Number(contractualHours),
        employment_type: employmentType,
        effective_from: effectiveFrom,
        notes: notes || null,
        lines: lines
          .filter((line) => line.component_code !== '' && Number(line.amount) >= 0)
          .map((line) => ({ component_code: line.component_code, amount: Number(line.amount) })),
      }
      if (editingId === null) {
        await createStructure(payload)
      } else {
        await updateStructure(editingId, payload)
      }
      setFormOpen(false)
      await loadStructures(employeeId)
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : t('Could not save the structure.'))
    } finally {
      setSaving(false)
    }
  }

  const employeeName = (id: number) => {
    const employee = employees.find((item) => item.id === id)
    return employee ? `${employee.firstName} ${employee.lastName}` : `#${id}`
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PAYROLL"
        title={t('Salary structures')}
        subtitle={t('Base salary and recurring components per employee, effective-dated. A change creates a new version — history is never rewritten.')}
      >
        <button type="button" className="button primary" onClick={openCreate}>
          {t('New structure')}
        </button>
      </PageHeader>

      {loadError ? <div className="payroll-error">{loadError}</div> : null}

      <div className="panel">
        <div className="payroll-form">
          <label>
            {t('Employee')}
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">{t('All employees')}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {formOpen ? (
        <div className="panel">
          <div className="panel-title">
            <h2>{editingId === null ? t('New structure') : t('New version of the structure')}</h2>
          </div>
          <p className="payroll-section-note">
            {editingId !== null
              ? t('Saving creates a new version starting on the effective date and closes the current version the day before.')
              : t('Creating a structure closes any overlapping version for this employee.')}
          </p>
          <div className="payroll-form">
            <div className="payroll-form-grid">
              <label>
                {t('Employee')}
                <input value={employeeName(Number(employeeId))} readOnly />
              </label>
              <label>
                {t('Base salary (DH / month)')}
                <input type="number" min={0} step={0.01} value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
              </label>
              <label>
                {t('Contractual hours / month')}
                <input type="number" min={1} max={744} value={contractualHours} onChange={(e) => setContractualHours(e.target.value)} />
              </label>
              <label>
                {t('Employment type')}
                <input value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} />
              </label>
              <label>
                {t('Effective from')}
                <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </label>
              <label>
                {t('Notes')}
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div>
              <p className="payroll-section-title">{t('Recurring components')}</p>
              {lines.map((line, index) => (
                <div key={index} className="payroll-form-grid" style={{ marginBottom: 8 }}>
                  <label>
                    {t('Component')}
                    <select
                      value={line.component_code}
                      onChange={(e) =>
                        setLines((current) => current.map((item, i) => (i === index ? { ...item, component_code: e.target.value } : item)))
                      }
                    >
                      <option value="">{t('Choose a component')}</option>
                      {components
                        .filter((component) => component.code !== 'base_salary' && component.code !== 'overtime')
                        .map((component) => (
                          <option key={component.code} value={component.code}>
                            {component.name_en ?? component.code} ({component.code})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {t('Amount (DH / month)')}
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.amount}
                      onChange={(e) =>
                        setLines((current) => current.map((item, i) => (i === index ? { ...item, amount: e.target.value } : item)))
                      }
                    />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      {t('Remove')}
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="button secondary" onClick={() => setLines((current) => [...current, EMPTY_LINE])}>
                {t('Add a component line')}
              </button>
            </div>
            {formError ? <div className="payroll-error">{formError}</div> : null}
            <div className="payroll-form-actions">
              <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
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
            {t('Structures')} ({structures.length})
          </h2>
        </div>
        {isLoading ? (
          <p style={{ padding: '0 20px 20px', color: 'var(--muted)' }}>{t('Loading…')}</p>
        ) : structures.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div className="payroll-empty">{t('No salary structure yet for this selection.')}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>{t('Employee')}</th>
                  <th className="num">{t('Base salary')}</th>
                  <th className="num">{t('Hours / month')}</th>
                  <th>{t('Components')}</th>
                  <th>{t('Effective')}</th>
                  <th>{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {structures.map((structure) => (
                  <tr key={structure.id}>
                    <td>{employeeName(structure.employee_id)}</td>
                    <td className="num">{formatDH(structure.base_salary)}</td>
                    <td className="num">{structure.contractual_hours_month ?? '—'}</td>
                    <td>
                      {structure.lines.length === 0
                        ? '—'
                        : structure.lines.map((line) => `${line.component_code} ${formatDH(line.amount)}`).join(' · ')}
                    </td>
                    <td>
                      {structure.effective_from ?? '—'} → {structure.effective_to ?? '…'}
                    </td>
                    <td>
                      <button type="button" className="button secondary" onClick={() => openEdit(structure)}>
                        {t('New version')}
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
