import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { useI18n } from '../../contexts/i18nHooks'
import { useAuth } from '../../contexts/authHooks'
import type { Employee, Goal, PerformanceReview, ReviewCycle } from '../../types/models'
import { employeeRepository, performanceActions } from '../../data/mockRepository'
import './PerformancePage.css'

type Tab = 'reviews' | 'goals' | 'cycles'

function emptyReviewForm(): {
  employeeId: string
  cycleId: string
  rating: string
  strengths: string
  improvements: string
  feedback: string
  status: string
} {
  return {
    employeeId: '',
    cycleId: '',
    rating: '',
    strengths: '',
    improvements: '',
    feedback: '',
    status: 'draft',
  }
}

function emptyGoalForm(): {
  employeeId: string
  title: string
  description: string
  targetDate: string
  status: string
  progress: string
} {
  return {
    employeeId: '',
    title: '',
    description: '',
    targetDate: '',
    status: 'not_started',
    progress: '0',
  }
}

function emptyCycleForm(): { title: string; periodStart: string; periodEnd: string; status: string } {
  return { title: '', periodStart: '', periodEnd: '', status: 'draft' }
}

const reviewStatuses = ['draft', 'submitted']
const goalStatuses = ['not_started', 'in_progress', 'completed']
const cycleStatuses = ['draft', 'active', 'closed']

function ratingStars(rating: number | null): string {
  if (rating === null) return '—'
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

export function PerformancePage(): React.JSX.Element {
  const { t } = useI18n()
  const { currentUser, isHR, hasPermission } = useAuth()
  const [tab, setTab] = useState<Tab>('reviews')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cycles, setCycles] = useState<ReviewCycle[]>([])
  const [reviews, setReviews] = useState<PerformanceReview[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [cycleFilter, setCycleFilter] = useState('')
  const [reviewFormOpen, setReviewFormOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState(emptyReviewForm())
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [reviewFormError, setReviewFormError] = useState<string | null>(null)
  const [reviewFormBusy, setReviewFormBusy] = useState(false)
  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const [goalForm, setGoalForm] = useState(emptyGoalForm())
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [goalFormError, setGoalFormError] = useState<string | null>(null)
  const [goalFormBusy, setGoalFormBusy] = useState(false)
  const [cycleFormOpen, setCycleFormOpen] = useState(false)
  const [cycleForm, setCycleForm] = useState(emptyCycleForm())
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null)
  const [cycleFormError, setCycleFormError] = useState<string | null>(null)
  const [cycleFormBusy, setCycleFormBusy] = useState(false)
  const [progressDraft, setProgressDraft] = useState<Record<string, string>>({})

  const myEmployeeId = currentUser?.employeeId ? String(currentUser.employeeId) : ''
  const canManage = isHR() || hasPermission('people.employee.view.department')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [cycleList, reviewList, goalList, employeeList] = await Promise.all([
        performanceActions.listCycles(),
        performanceActions.listReviews({ cycleId: cycleFilter || undefined }),
        performanceActions.listGoals(),
        employeeRepository.list(),
      ])
      setCycles(cycleList)
      setReviews(reviewList)
      setGoals(goalList)
      setEmployees(employeeList)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load performance data.')
    } finally {
      setLoading(false)
    }
  }, [cycleFilter])

  useEffect(() => {
    void load()
  }, [load])

  const employeeName = useCallback(
    (employeeId: string | number): string => {
      const found = employees.find((e) => String(e.id) === String(employeeId))
      return found ? `${found.firstName} ${found.lastName}` : String(employeeId)
    },
    [employees],
  )

  const filteredGoals = useMemo(
    () => (canManage ? goals : goals.filter((g) => String(g.employeeId) === myEmployeeId)),
    [goals, canManage, myEmployeeId],
  )

  function openNewReview(): void {
    setEditingReviewId(null)
    setReviewForm({ ...emptyReviewForm(), employeeId: myEmployeeId, cycleId: cycles[0]?.id ?? '' })
    setReviewFormError(null)
    setReviewFormOpen(true)
  }

  function openEditReview(review: PerformanceReview): void {
    setEditingReviewId(review.id)
    setReviewForm({
      employeeId: String(review.employeeId),
      cycleId: review.cycleId,
      rating: review.rating === null ? '' : String(review.rating),
      strengths: review.strengths ?? '',
      improvements: review.improvements ?? '',
      feedback: review.feedback ?? '',
      status: review.status,
    })
    setReviewFormError(null)
    setReviewFormOpen(true)
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setReviewFormError(null)
    setReviewFormBusy(true)
    try {
      const payload = {
        employeeId: Number(reviewForm.employeeId),
        cycleId: Number(reviewForm.cycleId),
        rating: reviewForm.rating ? Number(reviewForm.rating) : null,
        strengths: reviewForm.strengths || null,
        improvements: reviewForm.improvements || null,
        feedback: reviewForm.feedback || null,
        status: reviewForm.status,
      }
      if (editingReviewId) {
        await performanceActions.updateReview(editingReviewId, payload)
      } else {
        await performanceActions.createReview(payload)
      }
      setReviewFormOpen(false)
      setReviewForm(emptyReviewForm())
      setEditingReviewId(null)
      await load()
    } catch (e) {
      setReviewFormError(e instanceof Error ? e.message : 'Could not save the review.')
    } finally {
      setReviewFormBusy(false)
    }
  }

  async function deleteReview(id: string): Promise<void> {
    setError(null)
    try {
      await performanceActions.deleteReview(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the review.')
    }
  }

  function openNewGoal(): void {
    setEditingGoalId(null)
    setGoalForm({ ...emptyGoalForm(), employeeId: myEmployeeId })
    setGoalFormError(null)
    setGoalFormOpen(true)
  }

  function openEditGoal(goal: Goal): void {
    setEditingGoalId(goal.id)
    setGoalForm({
      employeeId: String(goal.employeeId),
      title: goal.title,
      description: goal.description ?? '',
      targetDate: goal.targetDate ?? '',
      status: goal.status,
      progress: String(goal.progress),
    })
    setGoalFormError(null)
    setGoalFormOpen(true)
  }

  async function submitGoal(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setGoalFormError(null)
    setGoalFormBusy(true)
    try {
      const payload = {
        employeeId: Number(goalForm.employeeId),
        title: goalForm.title.trim(),
        description: goalForm.description || null,
        targetDate: goalForm.targetDate || null,
        status: goalForm.status,
        progress: Number(goalForm.progress),
      }
      if (editingGoalId) {
        await performanceActions.updateGoal(editingGoalId, payload)
      } else {
        await performanceActions.createGoal(payload)
      }
      setGoalFormOpen(false)
      setGoalForm(emptyGoalForm())
      setEditingGoalId(null)
      await load()
    } catch (e) {
      setGoalFormError(e instanceof Error ? e.message : 'Could not save the goal.')
    } finally {
      setGoalFormBusy(false)
    }
  }

  async function deleteGoal(id: string): Promise<void> {
    setError(null)
    try {
      await performanceActions.deleteGoal(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the goal.')
    }
  }

  async function saveGoalProgress(goal: Goal): Promise<void> {
    const value = Number(progressDraft[goal.id] ?? goal.progress)
    if (Number.isNaN(value) || value < 0 || value > 100) return
    try {
      await performanceActions.updateGoal(goal.id, { progress: value })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update progress.')
    }
  }

  function openNewCycle(): void {
    setEditingCycleId(null)
    setCycleForm(emptyCycleForm())
    setCycleFormError(null)
    setCycleFormOpen(true)
  }

  function openEditCycle(cycle: ReviewCycle): void {
    setEditingCycleId(cycle.id)
    setCycleForm({
      title: cycle.title,
      periodStart: cycle.periodStart ?? '',
      periodEnd: cycle.periodEnd ?? '',
      status: cycle.status,
    })
    setCycleFormError(null)
    setCycleFormOpen(true)
  }

  async function submitCycle(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setCycleFormError(null)
    setCycleFormBusy(true)
    try {
      const payload = {
        title: cycleForm.title.trim(),
        periodStart: cycleForm.periodStart,
        periodEnd: cycleForm.periodEnd,
        status: cycleForm.status,
      }
      if (editingCycleId) {
        await performanceActions.updateCycle(editingCycleId, payload)
      } else {
        await performanceActions.createCycle(payload)
      }
      setCycleFormOpen(false)
      setCycleForm(emptyCycleForm())
      setEditingCycleId(null)
      await load()
    } catch (e) {
      setCycleFormError(e instanceof Error ? e.message : 'Could not save the review cycle.')
    } finally {
      setCycleFormBusy(false)
    }
  }

  async function deleteCycle(id: string): Promise<void> {
    setError(null)
    try {
      await performanceActions.deleteCycle(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the review cycle.')
    }
  }

  return (
    <div className="perf-page">
      <PageHeader
        eyebrow={t('performance')}
        title={t('performance')}
        subtitle="Reviews, goals and review cycles for every employee."
      >
        {tab === 'reviews' && canManage && (
          <button className="perf-btn perf-btn-primary" onClick={openNewReview}>
            New review
          </button>
        )}
        {tab === 'goals' && (
          <button className="perf-btn perf-btn-primary" onClick={openNewGoal}>
            New goal
          </button>
        )}
        {tab === 'cycles' && isHR() && (
          <button className="perf-btn perf-btn-primary" onClick={openNewCycle}>
            New review cycle
          </button>
        )}
      </PageHeader>

      <div className="perf-tabs">
        {(['reviews', 'goals', 'cycles'] as Tab[]).map((key) => (
          <button
            key={key}
            className={`perf-tab${tab === key ? ' perf-tab-active' : ''}`}
            onClick={() => setTab(key)}
            type="button"
          >
            {key === 'reviews' ? 'Reviews' : key === 'goals' ? 'Goals' : 'Review cycles'}
          </button>
        ))}
      </div>

      {error && (
        <div className="perf-error">
          <span>{error}</span>
          <button className="perf-btn perf-btn-outline" onClick={() => void load()} type="button">
            Retry
          </button>
        </div>
      )}

      {tab === 'reviews' && reviewFormOpen && (
        <form className="perf-panel perf-form" onSubmit={submitReview}>
          <div className="perf-form-head">
            <h2>{editingReviewId ? 'Edit review' : 'New review'}</h2>
            <button
              className="perf-btn perf-btn-outline"
              onClick={() => setReviewFormOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
          <div className="perf-form-grid">
            <label>
              Employee
              <select
                value={reviewForm.employeeId}
                onChange={(e) => setReviewForm({ ...reviewForm, employeeId: e.target.value })}
                required
              >
                <option value="">Select an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Review cycle
              <select
                value={reviewForm.cycleId}
                onChange={(e) => setReviewForm({ ...reviewForm, cycleId: e.target.value })}
                required
              >
                <option value="">Select a cycle</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rating (1–5)
              <select
                value={reviewForm.rating}
                onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
              >
                <option value="">No rating yet</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={reviewForm.status}
                onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value })}
              >
                {reviewStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="perf-span">
              Strengths
              <textarea
                rows={2}
                value={reviewForm.strengths}
                onChange={(e) => setReviewForm({ ...reviewForm, strengths: e.target.value })}
              />
            </label>
            <label className="perf-span">
              Areas to improve
              <textarea
                rows={2}
                value={reviewForm.improvements}
                onChange={(e) => setReviewForm({ ...reviewForm, improvements: e.target.value })}
              />
            </label>
            <label className="perf-span">
              Overall feedback
              <textarea
                rows={3}
                value={reviewForm.feedback}
                onChange={(e) => setReviewForm({ ...reviewForm, feedback: e.target.value })}
              />
            </label>
          </div>
          {reviewFormError && <p className="perf-form-error">{reviewFormError}</p>}
          <div className="perf-form-actions">
            <button className="perf-btn perf-btn-primary" disabled={reviewFormBusy} type="submit">
              {editingReviewId ? 'Save changes' : 'Create review'}
            </button>
          </div>
        </form>
      )}

      {tab === 'goals' && goalFormOpen && (
        <form className="perf-panel perf-form" onSubmit={submitGoal}>
          <div className="perf-form-head">
            <h2>{editingGoalId ? 'Edit goal' : 'New goal'}</h2>
            <button
              className="perf-btn perf-btn-outline"
              onClick={() => setGoalFormOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
          <div className="perf-form-grid">
            <label>
              Employee
              <select
                value={goalForm.employeeId}
                onChange={(e) => setGoalForm({ ...goalForm, employeeId: e.target.value })}
                required
              >
                <option value="">Select an employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                type="text"
                value={goalForm.title}
                onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                required
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                value={goalForm.targetDate}
                onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={goalForm.status}
                onChange={(e) => setGoalForm({ ...goalForm, status: e.target.value })}
              >
                {goalStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Progress (%)
              <input
                type="number"
                min={0}
                max={100}
                value={goalForm.progress}
                onChange={(e) => setGoalForm({ ...goalForm, progress: e.target.value })}
              />
            </label>
            <label className="perf-span">
              Description
              <textarea
                rows={3}
                value={goalForm.description}
                onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
              />
            </label>
          </div>
          {goalFormError && <p className="perf-form-error">{goalFormError}</p>}
          <div className="perf-form-actions">
            <button className="perf-btn perf-btn-primary" disabled={goalFormBusy} type="submit">
              {editingGoalId ? 'Save changes' : 'Create goal'}
            </button>
          </div>
        </form>
      )}

      {tab === 'cycles' && cycleFormOpen && (
        <form className="perf-panel perf-form" onSubmit={submitCycle}>
          <div className="perf-form-head">
            <h2>{editingCycleId ? 'Edit review cycle' : 'New review cycle'}</h2>
            <button
              className="perf-btn perf-btn-outline"
              onClick={() => setCycleFormOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
          <div className="perf-form-grid">
            <label>
              Title
              <input
                type="text"
                value={cycleForm.title}
                onChange={(e) => setCycleForm({ ...cycleForm, title: e.target.value })}
                required
              />
            </label>
            <label>
              Period start
              <input
                type="date"
                value={cycleForm.periodStart}
                onChange={(e) => setCycleForm({ ...cycleForm, periodStart: e.target.value })}
                required
              />
            </label>
            <label>
              Period end
              <input
                type="date"
                value={cycleForm.periodEnd}
                onChange={(e) => setCycleForm({ ...cycleForm, periodEnd: e.target.value })}
                required
              />
            </label>
            <label>
              Status
              <select
                value={cycleForm.status}
                onChange={(e) => setCycleForm({ ...cycleForm, status: e.target.value })}
              >
                {cycleStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cycleFormError && <p className="perf-form-error">{cycleFormError}</p>}
          <div className="perf-form-actions">
            <button className="perf-btn perf-btn-primary" disabled={cycleFormBusy} type="submit">
              {editingCycleId ? 'Save changes' : 'Create cycle'}
            </button>
          </div>
        </form>
      )}

      {tab === 'reviews' && (
        <section className="perf-panel">
          <div className="perf-filters">
            <label>
              Cycle
              <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)}>
                <option value="">All cycles</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading ? (
            <p className="perf-empty">Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="perf-empty">No reviews yet.</p>
          ) : (
            <table className="perf-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Reviewer</th>
                  <th>Cycle</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <strong>{review.employee ?? employeeName(review.employeeId)}</strong>
                    </td>
                    <td>{review.reviewer ?? '—'}</td>
                    <td>{review.cycle ?? '—'}</td>
                    <td>
                      <span title={review.rating === null ? 'No rating' : `${review.rating} / 5`}>
                        {ratingStars(review.rating)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={review.status} />
                    </td>
                    <td>
                      <div className="perf-actions">
                        {canManage && (
                          <button
                            className="perf-btn perf-btn-outline"
                            onClick={() => openEditReview(review)}
                            type="button"
                          >
                            Edit
                          </button>
                        )}
                        {isHR() && (
                          <button
                            className="perf-btn perf-btn-danger"
                            onClick={() => void deleteReview(review.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'goals' && (
        <section className="perf-panel">
          {loading ? (
            <p className="perf-empty">Loading goals…</p>
          ) : filteredGoals.length === 0 ? (
            <p className="perf-empty">No goals yet.</p>
          ) : (
            <table className="perf-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Goal</th>
                  <th>Target date</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredGoals.map((goal) => (
                  <tr key={goal.id}>
                    <td>
                      <strong>{goal.employee ?? employeeName(goal.employeeId)}</strong>
                    </td>
                    <td>
                      <strong>{goal.title}</strong>
                      {goal.description && <span className="perf-sub">{goal.description}</span>}
                    </td>
                    <td>{goal.targetDate ?? '—'}</td>
                    <td>
                      <div className="perf-progress">
                        <div className="perf-progress-bar">
                          <div
                            className="perf-progress-fill"
                            style={{ width: `${goal.progress}%` }}
                          />
                        </div>
                        <span>{goal.progress}%</span>
                      </div>
                      <div className="perf-progress-edit">
                        <input
                          aria-label="Progress percent"
                          type="number"
                          min={0}
                          max={100}
                          value={progressDraft[goal.id] ?? String(goal.progress)}
                          onChange={(e) =>
                            setProgressDraft({ ...progressDraft, [goal.id]: e.target.value })
                          }
                        />
                        <button
                          className="perf-btn perf-btn-outline"
                          onClick={() => void saveGoalProgress(goal)}
                          type="button"
                        >
                          Update
                        </button>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={goal.status} />
                    </td>
                    <td>
                      <div className="perf-actions">
                        <button
                          className="perf-btn perf-btn-outline"
                          onClick={() => openEditGoal(goal)}
                          type="button"
                        >
                          Edit
                        </button>
                        {(isHR() || String(goal.employeeId) === myEmployeeId) && (
                          <button
                            className="perf-btn perf-btn-danger"
                            onClick={() => void deleteGoal(goal.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'cycles' && (
        <section className="perf-panel">
          {loading ? (
            <p className="perf-empty">Loading review cycles…</p>
          ) : cycles.length === 0 ? (
            <p className="perf-empty">No review cycles yet.</p>
          ) : (
            <table className="perf-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.id}>
                    <td>
                      <strong>{cycle.title}</strong>
                    </td>
                    <td>
                      {cycle.periodStart ?? '—'} → {cycle.periodEnd ?? '—'}
                    </td>
                    <td>
                      <StatusBadge status={cycle.status} />
                    </td>
                    <td>
                      {isHR() && (
                        <div className="perf-actions">
                          <button
                            className="perf-btn perf-btn-outline"
                            onClick={() => openEditCycle(cycle)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="perf-btn perf-btn-danger"
                            onClick={() => void deleteCycle(cycle.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  )
}

export default PerformancePage
