import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { useAuth } from '../../contexts/authHooks'
import { attendanceActions, employeeRepository } from '../../data/mockRepository'
import type { AttendanceRecord, AttendanceStatus, Employee } from '../../types/models'
import './AttendancePage.css'

type Tab = 'mine' | 'team'

const todayString = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const nowTime = () => {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const monthRange = () => {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  return { from, to }
}

const statusLabel = (status: AttendanceStatus) =>
  status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : status === 'late' ? 'Late' : 'On leave'

type EntryForm = {
  employeeId: string
  date: string
  checkIn: string
  checkOut: string
  status: '' | 'present' | 'absent' | 'late'
  notes: string
}

const EMPTY_ENTRY: EntryForm = {
  employeeId: '',
  date: todayString(),
  checkIn: '',
  checkOut: '',
  status: '',
  notes: '',
}

export function AttendancePage() {
  const { currentUser, isHR, hasPermission } = useAuth()
  const canManage = isHR() || hasPermission('people.employee.view.department')
  const myEmployeeId = currentUser?.employeeId ?? 0

  const [tab, setTab] = useState<Tab>('mine')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [range, setRange] = useState(monthRange)
  const [employeeFilter, setEmployeeFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EntryForm>(EMPTY_ENTRY)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [recs, empRes] = await Promise.all([
        attendanceActions.list({
          from: range.from,
          to: range.to,
          employeeId: employeeFilter ? Number(employeeFilter) : undefined,
        }),
        employeeRepository.list({ pageSize: 100 }),
      ])
      setRecords(recs)
      setEmployees(empRes.data)
    } catch (err) {
      console.error('Failed to load attendance:', err)
      setLoadError('Could not load attendance records. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, employeeFilter])

  const sortedEmployees = useMemo(
    () =>
      [...employees].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      ),
    [employees],
  )

  const myRecords = useMemo(
    () => records.filter((r) => r.employeeId === myEmployeeId),
    [records, myEmployeeId],
  )

  const today = todayString()
  const todayRecord = useMemo(
    () => myRecords.find((r) => r.date === today && r.source === 'record'),
    [myRecords, today],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_ENTRY, employeeId: myEmployeeId ? String(myEmployeeId) : '' })
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (record: AttendanceRecord) => {
    setEditingId(record.id)
    setForm({
      employeeId: String(record.employeeId),
      date: record.date,
      checkIn: record.checkIn ?? '',
      checkOut: record.checkOut ?? '',
      status: record.status === 'leave' ? '' : record.status,
      notes: record.notes ?? '',
    })
    setFormError('')
    setFormOpen(true)
  }

  const saveEntry = async () => {
    if (!form.employeeId) return setFormError('Choose an employee.')
    if (!form.date) return setFormError('Choose a date.')
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn) {
      return setFormError('Check-out must be after check-in.')
    }
    setSaving(true)
    setFormError('')
    try {
      if (editingId) {
        const updated = await attendanceActions.update(editingId, {
          checkIn: form.checkIn || null,
          checkOut: form.checkOut || null,
          status: form.status || undefined,
          notes: form.notes || null,
        })
        setRecords((cur) => cur.map((r) => (r.id === editingId ? updated : r)))
      } else {
        const created = await attendanceActions.save({
          employeeId: Number(form.employeeId),
          date: form.date,
          checkIn: form.checkIn || null,
          checkOut: form.checkOut || null,
          status: form.status || undefined,
          notes: form.notes || null,
        })
        setRecords((cur) => {
          const rest = cur.filter(
            (r) => !(r.employeeId === created.employeeId && r.date === created.date && r.source === 'record'),
          )
          return [...rest, created].sort((a, b) =>
            a.date === b.date ? a.employeeId - b.employeeId : a.date.localeCompare(b.date),
          )
        })
      }
      setFormOpen(false)
    } catch (err) {
      console.error('Failed to save attendance:', err)
      setFormError(err instanceof Error ? err.message : 'Could not save this record.')
    } finally {
      setSaving(false)
    }
  }

  const checkInOut = async (kind: 'in' | 'out') => {
    if (myEmployeeId === 0) {
      setLoadError('Your account has no linked employee record, so you cannot check in or out.')
      return
    }
    setBusyId('today')
    try {
      const saved = await attendanceActions.save({
        employeeId: myEmployeeId,
        date: today,
        ...(kind === 'in' ? { checkIn: nowTime() } : { checkOut: nowTime() }),
      })
      setRecords((cur) => {
        const rest = cur.filter(
          (r) => !(r.employeeId === myEmployeeId && r.date === today && r.source === 'record'),
        )
        return [...rest, saved].sort((a, b) =>
          a.date === b.date ? a.employeeId - b.employeeId : a.date.localeCompare(b.date),
        )
      })
    } catch (err) {
      console.error('Failed to record attendance:', err)
      setLoadError(err instanceof Error ? err.message : 'Could not record attendance.')
    } finally {
      setBusyId(null)
    }
  }

  const validateRecord = async (record: AttendanceRecord) => {
    setBusyId(record.id)
    try {
      const updated = await attendanceActions.validate(record.id)
      setRecords((cur) => cur.map((r) => (r.id === record.id ? updated : r)))
    } catch (err) {
      console.error('Failed to validate record:', err)
      setLoadError(err instanceof Error ? err.message : 'Could not validate this record.')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await attendanceActions.remove(deleteTarget.id)
      setRecords((cur) => cur.filter((r) => r.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete record:', err)
      setLoadError('Could not delete this record.')
    } finally {
      setDeleting(false)
    }
  }

  const recordTable = (rows: AttendanceRecord[], showEmployee: boolean) => (
    <table className="att-table">
      <thead>
        <tr>
          {showEmployee && <th>Employee</th>}
          <th>Date</th>
          <th>Check-in</th>
          <th>Check-out</th>
          <th>Status</th>
          <th>Hours</th>
          <th>Validated</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((record) => (
          <tr key={record.id}>
            {showEmployee && (
              <td>
                <strong>{record.employee || '—'}</strong>
              </td>
            )}
            <td>{record.date}</td>
            <td>{record.checkIn ?? '—'}</td>
            <td>{record.checkOut ?? '—'}</td>
            <td>
              <StatusBadge status={statusLabel(record.status)} />
            </td>
            <td>{record.hoursWorked !== null ? `${record.hoursWorked} h` : '—'}</td>
            <td>
              {record.validated ? (
                <span className="att-validated">
                  <CheckCircle2 size={15} /> Validated
                </span>
              ) : (
                '—'
              )}
            </td>
            <td className="att-actions">
              {record.source === 'record' && (
                <>
                  {!record.validated && canManage && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busyId === record.id}
                      onClick={() => void validateRecord(record)}
                    >
                      Validate
                    </button>
                  )}
                  {(!record.validated || isHR()) && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit record for ${record.date}`}
                      onClick={() => openEdit(record)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {isHR() && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete record for ${record.date}`}
                      onClick={() => setDeleteTarget(record)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="TIME TRACKING"
        title="Attendance"
        subtitle="Manual check-in / check-out and timesheets. Approved leave shows as leave."
      >
        <button type="button" className="button primary" onClick={openCreate}>
          <Plus size={16} />
          New entry
        </button>
      </PageHeader>

      <div className="att-tabs" role="tablist" aria-label="Attendance views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'mine'}
          className={tab === 'mine' ? 'att-tab att-tab-active' : 'att-tab'}
          onClick={() => setTab('mine')}
        >
          My attendance
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'team'}
          className={tab === 'team' ? 'att-tab att-tab-active' : 'att-tab'}
          onClick={() => setTab('team')}
        >
          Team
        </button>
      </div>

      {loadError && (
        <div className="att-error" role="alert">
          {loadError}
          <button type="button" className="button secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {tab === 'mine' && (
        <section className="panel att-panel" aria-label="My attendance">
          {myEmployeeId === 0 ? (
            <p className="att-empty">Your account has no linked employee record, so there is no personal attendance to show.</p>
          ) : (
            <>
              <div className="att-today">
                <div>
                  <strong>Today · {today}</strong>
                  <span>
                    {todayRecord
                      ? `Checked in ${todayRecord.checkIn ?? '—'} · checked out ${todayRecord.checkOut ?? '—'}`
                      : 'No record yet today.'}
                  </span>
                </div>
                <div className="att-today-actions">
                  <button
                    type="button"
                    className="button primary"
                    disabled={busyId === 'today' || Boolean(todayRecord?.checkIn)}
                    onClick={() => void checkInOut('in')}
                  >
                    Check in
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busyId === 'today' || !todayRecord?.checkIn || Boolean(todayRecord?.checkOut)}
                    onClick={() => void checkInOut('out')}
                  >
                    Check out
                  </button>
                </div>
              </div>
              {isLoading ? (
                <p className="att-empty">Loading your attendance…</p>
              ) : myRecords.length === 0 ? (
                <p className="att-empty">No attendance records in this period.</p>
              ) : (
                recordTable(myRecords, false)
              )}
            </>
          )}
        </section>
      )}

      {tab === 'team' && (
        <section className="panel att-panel" aria-label="Team attendance">
          <div className="att-filters">
            <label>
              From
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((cur) => ({ ...cur, from: e.target.value }))}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={range.to}
                onChange={(e) => setRange((cur) => ({ ...cur, to: e.target.value }))}
              />
            </label>
            <label>
              Employee
              <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                <option value="">All employees</option>
                {sortedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isLoading ? (
            <p className="att-empty">Loading attendance…</p>
          ) : records.length === 0 ? (
            <p className="att-empty">No attendance records in this period.</p>
          ) : (
            recordTable(records, true)
          )}
        </section>
      )}

      {formOpen && (
        <section className="panel att-form" aria-label={editingId ? 'Edit entry' : 'New entry'}>
          <div className="att-form-head">
            <h2>{editingId ? 'Edit entry' : 'New entry'}</h2>
            <button type="button" className="icon-button" aria-label="Close form" onClick={() => setFormOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="att-form-grid">
            <label>
              Employee
              <select
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                disabled={Boolean(editingId)}
              >
                <option value="">Choose an employee…</option>
                {sortedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                disabled={Boolean(editingId)}
              />
            </label>
            <label>
              Check-in
              <input
                type="time"
                value={form.checkIn}
                onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
              />
            </label>
            <label>
              Check-out
              <input
                type="time"
                value={form.checkOut}
                onChange={(e) => setForm({ ...form, checkOut: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EntryForm['status'] })}
              >
                <option value="">Auto (from check-in time)</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
            </label>
            <label className="att-span">
              Notes
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional note"
              />
            </label>
          </div>
          <p className="att-hint">Check-in after 09:30 counts as late. Hours are computed from check-in / check-out.</p>
          {formError && (
            <p className="att-form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="att-form-actions">
            <button type="button" className="button secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className="button primary" onClick={() => void saveEntry()} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save entry'}
            </button>
          </div>
        </section>
      )}

      {deleteTarget && (
        <div className="att-confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete the attendance record for <strong>{deleteTarget.employee || 'this employee'}</strong> on{' '}
            <strong>{deleteTarget.date}</strong>?
          </p>
          <div className="att-form-actions">
            <button type="button" className="button secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete record'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
