import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { useAuth } from '../../contexts/authHooks'
import {
  employeeRepository,
  trainingCourseRepository,
  trainingEnrollmentRepository,
} from '../../data/mockRepository'
import type { Employee, TrainingCourse, TrainingEnrollment, TrainingCourseStatus } from '../../types/models'
import './TrainingPage.css'

type Tab = 'catalog' | 'my' | 'enrollments'

type CourseForm = {
  title: string
  description: string
  category: string
  durationHours: string
  provider: string
  status: TrainingCourseStatus
}

const EMPTY_FORM: CourseForm = {
  title: '',
  description: '',
  category: 'General',
  durationHours: '',
  provider: '',
  status: 'active',
}

const enrollmentStatusLabel = (status: TrainingEnrollment['status']) =>
  status === 'in_progress' ? 'In progress' : status === 'completed' ? 'Completed' : 'Enrolled'

export function TrainingPage() {
  const { currentUser, isHR } = useAuth()
  const canManage = isHR()
  const myEmployeeId = currentUser?.employeeId ?? 0

  const [tab, setTab] = useState<Tab>('catalog')
  const [courses, setCourses] = useState<TrainingCourse[]>([])
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CourseForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TrainingCourse | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [enrollEmployeeId, setEnrollEmployeeId] = useState('')
  const [enrollCourseId, setEnrollCourseId] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [progressDraft, setProgressDraft] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [courseRes, enrollmentRes, employeeRes] = await Promise.all([
        trainingCourseRepository.list({ pageSize: 100 }),
        trainingEnrollmentRepository.list({ pageSize: 200 }),
        employeeRepository.list({ pageSize: 100 }),
      ])
      setCourses(courseRes.data)
      setEnrollments(enrollmentRes.data)
      setEmployees(employeeRes.data)
    } catch (err) {
      console.error('Failed to load training data:', err)
      setLoadError('Could not load training data. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const categories = useMemo(
    () => [...new Set(courses.map((c) => c.category).filter(Boolean))].sort(),
    [courses],
  )

  const visibleCourses = useMemo(
    () => (categoryFilter ? courses.filter((c) => c.category === categoryFilter) : courses),
    [courses, categoryFilter],
  )

  const myEnrollments = useMemo(
    () => enrollments.filter((e) => e.employeeId === myEmployeeId),
    [enrollments, myEmployeeId],
  )

  const enrolledCourseIds = useMemo(() => new Set(myEnrollments.map((e) => e.courseId)), [myEnrollments])

  const sortedEmployees = useMemo(
    () =>
      [...employees].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      ),
    [employees],
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (course: TrainingCourse) => {
    setEditingId(course.id)
    setForm({
      title: course.title,
      description: course.description ?? '',
      category: course.category ?? 'General',
      durationHours: String(course.durationHours ?? 0),
      provider: course.provider ?? '',
      status: course.status,
    })
    setFormError('')
    setFormOpen(true)
  }

  const saveCourse = async () => {
    const title = form.title.trim()
    if (!title) return setFormError('Please enter a course title.')
    const durationHours = form.durationHours.trim() === '' ? 0 : Number(form.durationHours)
    if (Number.isNaN(durationHours) || durationHours < 0) {
      return setFormError('Duration must be a number of hours (0 or more).')
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        title,
        description: form.description.trim(),
        category: form.category.trim() || 'General',
        durationHours,
        provider: form.provider.trim(),
        status: form.status,
        enrollmentsCount: 0,
      }
      if (editingId) {
        const updated = await trainingCourseRepository.update(editingId, payload)
        if (updated) setCourses((cur) => cur.map((c) => (c.id === editingId ? updated : c)))
      } else {
        const created = await trainingCourseRepository.create(payload)
        setCourses((cur) => [...cur, created])
      }
      setFormOpen(false)
    } catch (err) {
      console.error('Failed to save course:', err)
      setFormError(err instanceof Error ? err.message : 'Could not save the course.')
    } finally {
      setSaving(false)
    }
  }

  const toggleArchive = async (course: TrainingCourse) => {
    setBusyId(course.id)
    try {
      const updated = await trainingCourseRepository.update(course.id, {
        status: course.status === 'active' ? 'archived' : 'active',
      })
      if (updated) setCourses((cur) => cur.map((c) => (c.id === course.id ? updated : c)))
    } catch (err) {
      console.error('Failed to update course:', err)
      setLoadError('Could not update the course.')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDeleteCourse = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await trainingCourseRepository.delete(deleteTarget.id)
      setCourses((cur) => cur.filter((c) => c.id !== deleteTarget.id))
      setEnrollments((cur) => cur.filter((e) => e.courseId !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete course:', err)
      setLoadError('Could not delete the course.')
    } finally {
      setDeleting(false)
    }
  }

  const enrollSelf = async (course: TrainingCourse) => {
    if (myEmployeeId === 0) {
      setLoadError('Your account has no linked employee record, so you cannot enroll yourself.')
      return
    }
    setBusyId(course.id)
    try {
      const created = await trainingEnrollmentRepository.create({
        employeeId: myEmployeeId,
        employee: currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : '',
        courseId: course.id,
        course: course.title,
        status: 'enrolled',
        progress: 0,
        completedAt: null,
      })
      setEnrollments((cur) => [created, ...cur])
      setCourses((cur) =>
        cur.map((c) => (c.id === course.id ? { ...c, enrollmentsCount: c.enrollmentsCount + 1 } : c)),
      )
    } catch (err) {
      console.error('Failed to enroll:', err)
      setLoadError(err instanceof Error ? err.message : 'Could not enroll in this course.')
    } finally {
      setBusyId(null)
    }
  }

  const enrollEmployee = async () => {
    if (!enrollEmployeeId || !enrollCourseId) {
      return setEnrollError('Choose an employee and a course.')
    }
    setEnrolling(true)
    setEnrollError('')
    try {
      const employee = employees.find((e) => String(e.id) === enrollEmployeeId)
      const course = courses.find((c) => c.id === enrollCourseId)
      const created = await trainingEnrollmentRepository.create({
        employeeId: Number(enrollEmployeeId),
        employee: employee ? `${employee.firstName} ${employee.lastName}`.trim() : '',
        courseId: enrollCourseId,
        course: course?.title ?? '',
        status: 'enrolled',
        progress: 0,
        completedAt: null,
      })
      setEnrollments((cur) => [created, ...cur])
      setEnrollEmployeeId('')
      setEnrollCourseId('')
    } catch (err) {
      console.error('Failed to enroll employee:', err)
      setEnrollError(err instanceof Error ? err.message : 'Could not enroll this employee.')
    } finally {
      setEnrolling(false)
    }
  }

  const updateProgress = async (enrollment: TrainingEnrollment, progress: number, markCompleted: boolean) => {
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))
    const status: TrainingEnrollment['status'] = markCompleted || safeProgress >= 100
      ? 'completed'
      : safeProgress > 0
        ? 'in_progress'
        : 'enrolled'
    setBusyId(enrollment.id)
    try {
      const updated = await trainingEnrollmentRepository.update(enrollment.id, {
        status,
        progress: safeProgress,
      })
      if (updated) {
        setEnrollments((cur) => cur.map((e) => (e.id === enrollment.id ? updated : e)))
        setProgressDraft((cur) => ({ ...cur, [enrollment.id]: String(updated.progress) }))
      }
    } catch (err) {
      console.error('Failed to update progress:', err)
      setLoadError(err instanceof Error ? err.message : 'Could not update progress.')
    } finally {
      setBusyId(null)
    }
  }

  const unenroll = async (enrollment: TrainingEnrollment) => {
    setBusyId(enrollment.id)
    try {
      await trainingEnrollmentRepository.delete(enrollment.id)
      setEnrollments((cur) => cur.filter((e) => e.id !== enrollment.id))
      setCourses((cur) =>
        cur.map((c) =>
          c.id === enrollment.courseId
            ? { ...c, enrollmentsCount: Math.max(0, c.enrollmentsCount - 1) }
            : c,
        ),
      )
    } catch (err) {
      console.error('Failed to unenroll:', err)
      setLoadError(err instanceof Error ? err.message : 'Could not remove this enrollment.')
    } finally {
      setBusyId(null)
    }
  }

  const progressValue = (enrollment: TrainingEnrollment) =>
    progressDraft[enrollment.id] ?? String(enrollment.progress)

  return (
    <div className="page">
      <PageHeader
        eyebrow="PEOPLE DEVELOPMENT"
        title="Training"
        subtitle="Course catalog, enrollments and learning progress."
      >
        {canManage && (
          <button type="button" className="button primary" onClick={openCreate}>
            <Plus size={16} />
            New course
          </button>
        )}
      </PageHeader>

      <div className="trn-tabs" role="tablist" aria-label="Training views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'catalog'}
          className={tab === 'catalog' ? 'trn-tab trn-tab-active' : 'trn-tab'}
          onClick={() => setTab('catalog')}
        >
          Course catalog
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'my'}
          className={tab === 'my' ? 'trn-tab trn-tab-active' : 'trn-tab'}
          onClick={() => setTab('my')}
        >
          My learning
        </button>
        {canManage && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'enrollments'}
            className={tab === 'enrollments' ? 'trn-tab trn-tab-active' : 'trn-tab'}
            onClick={() => setTab('enrollments')}
          >
            Enrollments
          </button>
        )}
      </div>

      {loadError && (
        <div className="trn-error" role="alert">
          {loadError}
          <button type="button" className="button secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {formOpen && (
        <section className="panel trn-form" aria-label={editingId ? 'Edit course' : 'New course'}>
          <div className="trn-form-head">
            <h2>{editingId ? 'Edit course' : 'New course'}</h2>
            <button type="button" className="icon-button" aria-label="Close form" onClick={() => setFormOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="trn-form-grid">
            <label className="trn-span">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Leadership Essentials"
              />
            </label>
            <label className="trn-span">
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What the course covers"
              />
            </label>
            <label>
              Category
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Leadership"
              />
            </label>
            <label>
              Duration (hours)
              <input
                value={form.durationHours}
                onChange={(e) => setForm({ ...form, durationHours: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="16"
                inputMode="numeric"
              />
            </label>
            <label>
              Provider
              <input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                placeholder="IntelligenceHR Academy"
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as TrainingCourseStatus })}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          {formError && (
            <p className="trn-form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="trn-form-actions">
            <button type="button" className="button secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className="button primary" onClick={() => void saveCourse()} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create course'}
            </button>
          </div>
        </section>
      )}

      {tab === 'catalog' && (
        <section className="panel trn-panel" aria-label="Course catalog">
          <div className="trn-filter">
            <label>
              Category
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isLoading ? (
            <p className="trn-empty">Loading courses…</p>
          ) : visibleCourses.length === 0 ? (
            <p className="trn-empty">No courses yet. Create the first one to get started.</p>
          ) : (
            <table className="trn-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Provider</th>
                  <th>Enrolled</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleCourses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <strong>{course.title}</strong>
                      <small>{course.description || '—'}</small>
                    </td>
                    <td>{course.category}</td>
                    <td>{course.durationHours} h</td>
                    <td>{course.provider || '—'}</td>
                    <td>{course.enrollmentsCount}</td>
                    <td>
                      <StatusBadge status={course.status === 'active' ? 'Active' : 'Archived'} />
                    </td>
                    <td className="trn-actions">
                      {course.status === 'active' &&
                        (enrolledCourseIds.has(course.id) ? (
                          <span className="trn-enrolled">
                            <CheckCircle2 size={15} /> Enrolled
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busyId === course.id || myEmployeeId === 0}
                            onClick={() => void enrollSelf(course)}
                          >
                            Enroll
                          </button>
                        ))}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Edit ${course.title}`}
                            onClick={() => openEdit(course)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busyId === course.id}
                            onClick={() => void toggleArchive(course)}
                          >
                            {course.status === 'active' ? 'Archive' : 'Unarchive'}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Delete ${course.title}`}
                            onClick={() => setDeleteTarget(course)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'my' && (
        <section className="panel trn-panel" aria-label="My learning">
          {myEmployeeId === 0 ? (
            <p className="trn-empty">Your account has no linked employee record, so there is no personal learning history to show.</p>
          ) : isLoading ? (
            <p className="trn-empty">Loading your courses…</p>
          ) : myEnrollments.length === 0 ? (
            <p className="trn-empty">You are not enrolled in any course yet. Browse the catalog to enroll.</p>
          ) : (
            <table className="trn-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Completed</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {myEnrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td>
                      <strong>{enrollment.course}</strong>
                    </td>
                    <td>
                      <StatusBadge status={enrollmentStatusLabel(enrollment.status)} />
                    </td>
                    <td>
                      <div className="trn-progress">
                        <div className="trn-progress-bar">
                          <span style={{ width: `${enrollment.progress}%` }} />
                        </div>
                        <input
                          className="trn-progress-input"
                          type="number"
                          min={0}
                          max={100}
                          value={progressValue(enrollment)}
                          aria-label={`Progress for ${enrollment.course}`}
                          onChange={(e) =>
                            setProgressDraft((cur) => ({ ...cur, [enrollment.id]: e.target.value }))
                          }
                        />
                        <span>%</span>
                      </div>
                    </td>
                    <td>{enrollment.completedAt ? enrollment.completedAt.slice(0, 10) : '—'}</td>
                    <td className="trn-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busyId === enrollment.id}
                        onClick={() =>
                          void updateProgress(enrollment, Number(progressValue(enrollment) || 0), false)
                        }
                      >
                        Save progress
                      </button>
                      {enrollment.status !== 'completed' && (
                        <button
                          type="button"
                          className="button primary"
                          disabled={busyId === enrollment.id}
                          onClick={() => void updateProgress(enrollment, 100, true)}
                        >
                          Mark completed
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Unenroll from ${enrollment.course}`}
                        disabled={busyId === enrollment.id}
                        onClick={() => void unenroll(enrollment)}
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'enrollments' && canManage && (
        <section className="panel trn-panel" aria-label="All enrollments">
          <div className="trn-enroll-form">
            <select
              value={enrollEmployeeId}
              onChange={(e) => setEnrollEmployeeId(e.target.value)}
              aria-label="Employee to enroll"
            >
              <option value="">Choose an employee…</option>
              {sortedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </select>
            <select
              value={enrollCourseId}
              onChange={(e) => setEnrollCourseId(e.target.value)}
              aria-label="Course to enroll in"
            >
              <option value="">Choose a course…</option>
              {courses
                .filter((c) => c.status === 'active')
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
            </select>
            <button type="button" className="button primary" disabled={enrolling} onClick={() => void enrollEmployee()}>
              {enrolling ? 'Enrolling…' : 'Enroll employee'}
            </button>
          </div>
          {enrollError && (
            <p className="trn-form-error" role="alert">
              {enrollError}
            </p>
          )}
          {isLoading ? (
            <p className="trn-empty">Loading enrollments…</p>
          ) : enrollments.length === 0 ? (
            <p className="trn-empty">No enrollments yet.</p>
          ) : (
            <table className="trn-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Completed</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td>
                      <strong>{enrollment.employee || '—'}</strong>
                    </td>
                    <td>{enrollment.course}</td>
                    <td>
                      <StatusBadge status={enrollmentStatusLabel(enrollment.status)} />
                    </td>
                    <td>{enrollment.progress}%</td>
                    <td>{enrollment.completedAt ? enrollment.completedAt.slice(0, 10) : '—'}</td>
                    <td className="trn-actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove ${enrollment.employee} from ${enrollment.course}`}
                        disabled={busyId === enrollment.id}
                        onClick={() => void unenroll(enrollment)}
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
      )}

      {deleteTarget && (
        <div className="trn-confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete the <strong>{deleteTarget.title}</strong> course? Enrollments in this course will be
            removed as well.
          </p>
          <div className="trn-form-actions">
            <button type="button" className="button secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void confirmDeleteCourse()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete course'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
