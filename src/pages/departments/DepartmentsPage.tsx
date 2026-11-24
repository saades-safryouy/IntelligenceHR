import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { departmentRepository, employeeRepository } from '../../data/mockRepository'
import type { Department, Employee } from '../../types/models'
import './DepartmentsPage.css'

type FormState = {
  id: string
  name: string
  code: string
  description: string
  managerId: string
  budget: string
  parentId: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  id: '',
  name: '',
  code: '',
  description: '',
  managerId: '',
  budget: '',
  parentId: '',
  isActive: true,
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)

const employeeName = (employee: Employee) =>
  `${employee.firstName} ${employee.lastName}`.trim()

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [deptRes, empRes] = await Promise.all([
        departmentRepository.list(),
        employeeRepository.list({ pageSize: 100 }),
      ])
      setDepartments(deptRes.data)
      setEmployees(empRes.data)
    } catch (err) {
      console.error('Failed to load departments:', err)
      setLoadError('Could not load departments. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const managers = useMemo(
    () => [...employees].sort((a, b) => employeeName(a).localeCompare(employeeName(b))),
    [employees],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (dept: Department) => {
    setEditingId(dept.id)
    setForm({
      id: dept.id,
      name: dept.name,
      code: dept.code ?? '',
      description: dept.description ?? '',
      managerId: dept.managerId != null ? String(dept.managerId) : '',
      budget: dept.budget && dept.budget !== '$0' ? dept.budget.replace(/[^0-9.]/g, '') : '',
      parentId: dept.parentId ?? '',
      isActive: dept.isActive ?? true,
    })
    setFormError('')
    setFormOpen(true)
  }

  const save = async () => {
    const name = form.name.trim()
    if (!name) return setFormError('Please enter a department name.')
    const id = editingId ?? slugify(form.id || name)
    if (!id) return setFormError('Please enter a short id (letters, numbers, dashes).')
    if (!editingId && departments.some((d) => d.id === id)) {
      return setFormError(`A department with the id "${id}" already exists.`)
    }
    const managerId = form.managerId ? Number(form.managerId) : null
    if (form.managerId && Number.isNaN(managerId)) return setFormError('Please choose a manager from the list.')
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name,
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
        managerId,
        budget: form.budget.trim() || undefined,
        parentId: form.parentId || null,
        isActive: form.isActive,
      }
      if (editingId) {
        const updated = await departmentRepository.update(editingId, payload)
        if (updated) setDepartments((cur) => cur.map((d) => (d.id === editingId ? updated : d)))
      } else {
        const created = await departmentRepository.create({ ...payload, id } as unknown as Omit<Department, 'id'>)
        setDepartments((cur) => [...cur, created])
      }
      setFormOpen(false)
    } catch (err) {
      console.error('Failed to save department:', err)
      setFormError(err instanceof Error ? err.message : 'Could not save the department.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await departmentRepository.delete(deleteTarget.id)
      setDepartments((cur) => cur.filter((d) => d.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete department:', err)
      setLoadError('Could not delete the department. It may still have employees assigned.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="ORGANIZATION"
        title="Departments"
        subtitle="Manage the departments, their managers and their budgets."
      >
        <button type="button" className="button primary" onClick={openCreate}>
          <Plus size={16} />
          New department
        </button>
      </PageHeader>

      {loadError && (
        <div className="dept-error" role="alert">
          {loadError}
          <button type="button" className="button secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {formOpen && (
        <section className="panel dept-form" aria-label={editingId ? 'Edit department' : 'New department'}>
          <div className="dept-form-head">
            <h2>{editingId ? 'Edit department' : 'New department'}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close form"
              onClick={() => setFormOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="dept-form-grid">
            {!editingId && (
              <label>
                Short id
                <input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: slugify(e.target.value) })}
                  placeholder="eng (auto-filled from the name)"
                />
              </label>
            )}
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) =>
                  setForm((cur) => ({
                    ...cur,
                    name: e.target.value,
                    id: editingId ? cur.id : cur.id || slugify(e.target.value),
                  }))
                }
                placeholder="Engineering"
              />
            </label>
            <label>
              Code
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="ENG"
              />
            </label>
            <label className="dept-span">
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this department does"
              />
            </label>
            <label>
              Manager
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
              >
                <option value="">No manager</option>
                {managers.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employeeName(employee)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Budget
              <input
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="1200000"
                inputMode="decimal"
              />
            </label>
            <label>
              Parent department
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">None (top level)</option>
                {departments
                  .filter((d) => d.id !== editingId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="dept-check">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
          </div>

          {formError && (
            <p className="dept-form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="dept-form-actions">
            <button type="button" className="button secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create department'}
            </button>
          </div>
        </section>
      )}

      <section className="panel dept-panel" aria-label="Department list">
        {isLoading ? (
          <p className="dept-empty">Loading departments…</p>
        ) : departments.length === 0 ? (
          <p className="dept-empty">No departments yet. Create the first one to get started.</p>
        ) : (
          <table className="dept-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Manager</th>
                <th>Employees</th>
                <th>Budget</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept.id}>
                  <td>
                    <strong>{dept.name}</strong>
                    <small>{[dept.code, dept.id].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td>{dept.manager || '—'}</td>
                  <td>{dept.employeeCount ?? 0}</td>
                  <td>{dept.budget ?? '—'}</td>
                  <td>
                    <StatusBadge status={dept.isActive === false ? 'Inactive' : 'Active'} />
                  </td>
                  <td className="dept-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${dept.name}`}
                      onClick={() => openEdit(dept)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${dept.name}`}
                      onClick={() => setDeleteTarget(dept)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {deleteTarget && (
        <div className="dept-confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete the <strong>{deleteTarget.name}</strong> department? Employees assigned to it keep
            their records, but the department itself will be gone.
          </p>
          <div className="dept-form-actions">
            <button type="button" className="button secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete department'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
