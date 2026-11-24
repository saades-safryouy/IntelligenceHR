import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../../components/PageHeader'
import StatusBadge from '../../components/StatusBadge'
import { useI18n } from '../../contexts/i18nHooks'
import { useAuth } from '../../contexts/authHooks'
import type { Candidate, Department, Interview, Job, JobApplication } from '../../types/models'
import { departmentRepository, recruitmentActions } from '../../data/mockRepository'
import { apiFile } from '../../lib/apiClient'
import './RecruitmentPage.css'

type Tab = 'pipeline' | 'jobs' | 'candidates'

const stages = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const
type Stage = (typeof stages)[number]

const stageLabels: Record<Stage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

function emptyJobForm(): {
  title: string
  departmentId: string
  description: string
  location: string
  employmentType: string
  status: string
} {
  return {
    title: '',
    departmentId: '',
    description: '',
    location: 'Casablanca',
    employmentType: 'Full-time',
    status: 'open',
  }
}

function emptyApplicationForm(): {
  jobId: string
  candidateId: string
  candidateName: string
  candidateEmail: string
  candidatePhone: string
  notes: string
} {
  return { jobId: '', candidateId: '', candidateName: '', candidateEmail: '', candidatePhone: '', notes: '' }
}

function emptyInterviewForm(): { scheduledAt: string; interviewer: string; notes: string } {
  return { scheduledAt: '', interviewer: '', notes: '' }
}

export function RecruitmentPage(): React.JSX.Element {
  const { t } = useI18n()
  const { isHR } = useAuth()
  const [tab, setTab] = useState<Tab>('pipeline')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [jobFilter, setJobFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jobFormOpen, setJobFormOpen] = useState(false)
  const [jobForm, setJobForm] = useState(emptyJobForm())
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [jobFormError, setJobFormError] = useState<string | null>(null)
  const [jobFormBusy, setJobFormBusy] = useState(false)
  const [appFormOpen, setAppFormOpen] = useState(false)
  const [appForm, setAppForm] = useState(emptyApplicationForm())
  const [appFormError, setAppFormError] = useState<string | null>(null)
  const [appFormBusy, setAppFormBusy] = useState(false)
  const [interviewFormOpen, setInterviewFormOpen] = useState(false)
  const [interviewForm, setInterviewForm] = useState(emptyInterviewForm())
  const [interviewFormError, setInterviewFormError] = useState<string | null>(null)
  const [interviewFormBusy, setInterviewFormBusy] = useState(false)
  const [cvBusy, setCvBusy] = useState(false)
  const [cvError, setCvError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const cvInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobList, deptList, candidateList, applicationList, interviewList] = await Promise.all([
        recruitmentActions.listJobs(),
        departmentRepository.list(),
        recruitmentActions.listCandidates(),
        recruitmentActions.listApplications({ jobId: jobFilter || undefined }),
        recruitmentActions.listInterviews(),
      ])
      setJobs(jobList)
      setDepartments(deptList)
      setCandidates(candidateList)
      setApplications(applicationList)
      setInterviews(interviewList)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recruitment data.')
    } finally {
      setLoading(false)
    }
  }, [jobFilter])

  useEffect(() => {
    void load()
  }, [load])

  const selected = useMemo(
    () => applications.find((a) => a.id === selectedId) ?? null,
    [applications, selectedId],
  )
  const selectedCandidate = useMemo(
    () => (selected ? candidates.find((c) => String(c.id) === String(selected.candidateId)) ?? null : null),
    [selected, candidates],
  )
  const selectedInterviews = useMemo(
    () => (selected ? interviews.filter((i) => String(i.applicationId) === String(selected.id)) : []),
    [selected, interviews],
  )
  const departmentName = useCallback(
    (departmentId: string): string => {
      const found = departments.find((d) => String(d.id) === String(departmentId))
      return found ? found.name : departmentId
    },
    [departments],
  )

  async function moveStage(application: JobApplication, stage: Stage): Promise<void> {
    setError(null)
    setNotice(null)
    try {
      const updated = await recruitmentActions.updateApplication(application.id, { stage })
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      if (stage === 'hired' && updated.onboardingCaseId) {
        setNotice(
          `Hired! Employee record created and onboarding case #${updated.onboardingCaseId} opened.`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the application.')
    }
  }

  async function deleteApplication(id: string): Promise<void> {
    setError(null)
    try {
      await recruitmentActions.deleteApplication(id)
      if (selectedId === id) setSelectedId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the application.')
    }
  }

  function openNewJob(): void {
    setEditingJobId(null)
    setJobForm({ ...emptyJobForm(), departmentId: departments[0]?.id ? String(departments[0].id) : '' })
    setJobFormError(null)
    setJobFormOpen(true)
  }

  function openEditJob(job: Job): void {
    setEditingJobId(job.id)
    setJobForm({
      title: job.title,
      departmentId: job.departmentId,
      description: job.description ?? '',
      location: job.location,
      employmentType: job.employmentType,
      status: job.status,
    })
    setJobFormError(null)
    setJobFormOpen(true)
  }

  async function submitJob(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setJobFormError(null)
    setJobFormBusy(true)
    try {
      const payload = {
        title: jobForm.title.trim(),
        departmentId: jobForm.departmentId,
        description: jobForm.description || null,
        location: jobForm.location.trim() || 'Casablanca',
        employmentType: jobForm.employmentType.trim() || 'Full-time',
        status: jobForm.status,
      }
      if (editingJobId) {
        await recruitmentActions.updateJob(editingJobId, payload)
      } else {
        await recruitmentActions.createJob(payload)
      }
      setJobFormOpen(false)
      setJobForm(emptyJobForm())
      setEditingJobId(null)
      await load()
    } catch (e) {
      setJobFormError(e instanceof Error ? e.message : 'Could not save the job.')
    } finally {
      setJobFormBusy(false)
    }
  }

  async function deleteJob(id: string): Promise<void> {
    setError(null)
    try {
      await recruitmentActions.deleteJob(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the job.')
    }
  }

  function openNewApplication(): void {
    setAppForm({ ...emptyApplicationForm(), jobId: jobFilter || (jobs[0] ? String(jobs[0].id) : '') })
    setAppFormError(null)
    setAppFormOpen(true)
  }

  async function submitApplication(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAppFormError(null)
    setAppFormBusy(true)
    try {
      await recruitmentActions.createApplication({
        jobId: Number(appForm.jobId),
        candidateId: appForm.candidateId ? Number(appForm.candidateId) : undefined,
        candidateName: appForm.candidateId ? undefined : appForm.candidateName.trim(),
        candidateEmail: appForm.candidateId ? undefined : appForm.candidateEmail.trim(),
        candidatePhone: appForm.candidateId ? undefined : appForm.candidatePhone.trim() || undefined,
        notes: appForm.notes || null,
      })
      setAppFormOpen(false)
      setAppForm(emptyApplicationForm())
      await load()
    } catch (e) {
      setAppFormError(e instanceof Error ? e.message : 'Could not add the application.')
    } finally {
      setAppFormBusy(false)
    }
  }

  async function submitInterview(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!selected) return
    setInterviewFormError(null)
    setInterviewFormBusy(true)
    try {
      await recruitmentActions.createInterview({
        applicationId: Number(selected.id),
        scheduledAt: interviewForm.scheduledAt,
        interviewer: interviewForm.interviewer.trim() || null,
        notes: interviewForm.notes || null,
      })
      setInterviewFormOpen(false)
      setInterviewForm(emptyInterviewForm())
      await load()
    } catch (e) {
      setInterviewFormError(e instanceof Error ? e.message : 'Could not schedule the interview.')
    } finally {
      setInterviewFormBusy(false)
    }
  }

  async function setInterviewOutcome(interview: Interview, outcome: 'passed' | 'failed'): Promise<void> {
    setError(null)
    try {
      await recruitmentActions.updateInterview(interview.id, { outcome })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the interview outcome.')
    }
  }

  async function uploadCv(candidateId: string, file: File): Promise<void> {
    setCvBusy(true)
    setCvError(null)
    try {
      await recruitmentActions.uploadCv(candidateId, file)
      await load()
    } catch (e) {
      setCvError(e instanceof Error ? e.message : 'Could not upload the CV.')
    } finally {
      setCvBusy(false)
    }
  }

  async function downloadCv(candidate: Candidate): Promise<void> {
    setCvError(null)
    try {
      const { blob, filename } = await apiFile(`/api/v1/candidates/${candidate.id}/cv`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setCvError(e instanceof Error ? e.message : 'Could not download the CV.')
    }
  }

  return (
    <div className="rec-page">
      <PageHeader
        eyebrow={t('recruitment')}
        title={t('recruitment')}
        subtitle="Open roles, candidate pipeline and interviews — hiring feeds straight into onboarding."
      >
        {tab === 'pipeline' && isHR() && (
          <button className="rec-btn rec-btn-primary" onClick={openNewApplication}>
            New application
          </button>
        )}
        {tab === 'jobs' && isHR() && (
          <button className="rec-btn rec-btn-primary" onClick={openNewJob}>
            New job
          </button>
        )}
      </PageHeader>

      <div className="rec-tabs">
        {(['pipeline', 'jobs', 'candidates'] as Tab[]).map((key) => (
          <button
            key={key}
            className={`rec-tab${tab === key ? ' rec-tab-active' : ''}`}
            onClick={() => setTab(key)}
            type="button"
          >
            {key === 'pipeline' ? 'Pipeline' : key === 'jobs' ? 'Jobs' : 'Candidates'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rec-error">
          <span>{error}</span>
          <button className="rec-btn rec-btn-outline" onClick={() => void load()} type="button">
            Retry
          </button>
        </div>
      )}
      {notice && <div className="rec-notice">{notice}</div>}

      {tab === 'pipeline' && (
        <>
          <div className="rec-filters">
            <label>
              Job
              <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
                <option value="">All jobs</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {appFormOpen && (
            <form className="rec-panel rec-form" onSubmit={submitApplication}>
              <div className="rec-form-head">
                <h2>New application</h2>
                <button
                  className="rec-btn rec-btn-outline"
                  onClick={() => setAppFormOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <div className="rec-form-grid">
                <label>
                  Job
                  <select
                    value={appForm.jobId}
                    onChange={(e) => setAppForm({ ...appForm, jobId: e.target.value })}
                    required
                  >
                    <option value="">Select a job</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Existing candidate
                  <select
                    value={appForm.candidateId}
                    onChange={(e) => setAppForm({ ...appForm, candidateId: e.target.value })}
                  >
                    <option value="">New candidate (fill in below)</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.email}
                      </option>
                    ))}
                  </select>
                </label>
                {!appForm.candidateId && (
                  <>
                    <label>
                      Candidate name
                      <input
                        type="text"
                        value={appForm.candidateName}
                        onChange={(e) => setAppForm({ ...appForm, candidateName: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Candidate email
                      <input
                        type="email"
                        value={appForm.candidateEmail}
                        onChange={(e) => setAppForm({ ...appForm, candidateEmail: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Candidate phone
                      <input
                        type="tel"
                        value={appForm.candidatePhone}
                        onChange={(e) => setAppForm({ ...appForm, candidatePhone: e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label className="rec-span">
                  Notes
                  <textarea
                    rows={2}
                    value={appForm.notes}
                    onChange={(e) => setAppForm({ ...appForm, notes: e.target.value })}
                  />
                </label>
              </div>
              {appFormError && <p className="rec-form-error">{appFormError}</p>}
              <div className="rec-form-actions">
                <button className="rec-btn rec-btn-primary" disabled={appFormBusy} type="submit">
                  Add application
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="rec-empty">Loading pipeline…</p>
          ) : applications.length === 0 ? (
            <p className="rec-empty">No applications yet.</p>
          ) : (
            <div className="rec-board">
              {stages.map((stage) => (
                <section key={stage} className="rec-column">
                  <h3>
                    {stageLabels[stage]}
                    <span>{applications.filter((a) => a.stage === stage).length}</span>
                  </h3>
                  {applications
                    .filter((a) => a.stage === stage)
                    .map((application) => (
                      <article
                        key={application.id}
                        className={`rec-card${selectedId === application.id ? ' rec-card-selected' : ''}`}
                        onClick={() => setSelectedId(application.id)}
                      >
                        <strong>{application.candidate ?? '—'}</strong>
                        <span>{application.job ?? '—'}</span>
                        {application.notes && <p>{application.notes}</p>}
                        {application.onboardingCaseId && (
                          <span className="rec-onboarding">
                            Onboarding case #{application.onboardingCaseId}
                          </span>
                        )}
                        {isHR() && (
                          <div className="rec-card-actions" onClick={(e) => e.stopPropagation()}>
                            <select
                              aria-label="Move to stage"
                              value={application.stage}
                              onChange={(e) => void moveStage(application, e.target.value as Stage)}
                            >
                              {stages.map((s) => (
                                <option key={s} value={s}>
                                  {stageLabels[s]}
                                </option>
                              ))}
                            </select>
                            <button
                              className="rec-btn rec-btn-danger"
                              onClick={() => void deleteApplication(application.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                </section>
              ))}
            </div>
          )}

          {selected && (
            <section className="rec-panel rec-detail">
              <div className="rec-detail-head">
                <h2>{selected.candidate ?? 'Candidate'}</h2>
                <button
                  className="rec-btn rec-btn-outline"
                  onClick={() => setSelectedId(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <p className="rec-detail-sub">
                {selected.job ?? '—'} · {selected.candidateEmail ?? '—'}
                {selectedCandidate?.phone ? ` · ${selectedCandidate.phone}` : ''}
              </p>
              <div className="rec-detail-grid">
                <div>
                  <h3>CV</h3>
                  {selectedCandidate ? (
                    selectedCandidate.hasCv ? (
                      <div className="rec-cv-actions">
                        <button
                          className="rec-btn rec-btn-outline"
                          onClick={() => void downloadCv(selectedCandidate)}
                          type="button"
                        >
                          Download CV
                        </button>
                        <button
                          className="rec-btn rec-btn-outline"
                          onClick={() => cvInputRef.current?.click()}
                          disabled={cvBusy}
                          type="button"
                        >
                          Replace CV
                        </button>
                      </div>
                    ) : (
                      <button
                        className="rec-btn rec-btn-outline"
                        onClick={() => cvInputRef.current?.click()}
                        disabled={cvBusy}
                        type="button"
                      >
                        Upload CV
                      </button>
                    )
                  ) : (
                    <p>No candidate record.</p>
                  )}
                  <input
                    ref={cvInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file && selectedCandidate) void uploadCv(String(selectedCandidate.id), file)
                      e.target.value = ''
                    }}
                  />
                  {cvError && <p className="rec-form-error">{cvError}</p>}
                  <p className="rec-hint">PDF or Word, max 20 MB. Stored on the public disk like employee documents.</p>
                </div>
                <div>
                  <h3>Interviews</h3>
                  {selectedInterviews.length === 0 ? (
                    <p>No interviews scheduled.</p>
                  ) : (
                    <ul className="rec-interviews">
                      {selectedInterviews.map((interview) => (
                        <li key={interview.id}>
                          <strong>
                            {interview.scheduledAt
                              ? new Date(interview.scheduledAt).toLocaleString()
                              : '—'}
                          </strong>
                          <span>
                            {interview.interviewer ?? '—'} · <StatusBadge status={interview.outcome} />
                          </span>
                          {interview.notes && <p>{interview.notes}</p>}
                          {isHR() && interview.outcome === 'pending' && (
                            <div className="rec-card-actions">
                              <button
                                className="rec-btn rec-btn-outline"
                                onClick={() => void setInterviewOutcome(interview, 'passed')}
                                type="button"
                              >
                                Passed
                              </button>
                              <button
                                className="rec-btn rec-btn-danger"
                                onClick={() => void setInterviewOutcome(interview, 'failed')}
                                type="button"
                              >
                                Failed
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isHR() && (
                    <button
                      className="rec-btn rec-btn-outline"
                      onClick={() => {
                        setInterviewForm(emptyInterviewForm())
                        setInterviewFormError(null)
                        setInterviewFormOpen((open) => !open)
                      }}
                      type="button"
                    >
                      Schedule interview
                    </button>
                  )}
                  {interviewFormOpen && (
                    <form className="rec-interview-form" onSubmit={submitInterview}>
                      <label>
                        Date and time
                        <input
                          type="datetime-local"
                          value={interviewForm.scheduledAt}
                          onChange={(e) =>
                            setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })
                          }
                          required
                        />
                      </label>
                      <label>
                        Interviewer
                        <input
                          type="text"
                          value={interviewForm.interviewer}
                          onChange={(e) =>
                            setInterviewForm({ ...interviewForm, interviewer: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Notes
                        <textarea
                          rows={2}
                          value={interviewForm.notes}
                          onChange={(e) =>
                            setInterviewForm({ ...interviewForm, notes: e.target.value })
                          }
                        />
                      </label>
                      {interviewFormError && <p className="rec-form-error">{interviewFormError}</p>}
                      <button
                        className="rec-btn rec-btn-primary"
                        disabled={interviewFormBusy}
                        type="submit"
                      >
                        Save interview
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'jobs' && (
        <>
          {jobFormOpen && (
            <form className="rec-panel rec-form" onSubmit={submitJob}>
              <div className="rec-form-head">
                <h2>{editingJobId ? 'Edit job' : 'New job'}</h2>
                <button
                  className="rec-btn rec-btn-outline"
                  onClick={() => setJobFormOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <div className="rec-form-grid">
                <label>
                  Title
                  <input
                    type="text"
                    value={jobForm.title}
                    onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Department
                  <select
                    value={jobForm.departmentId}
                    onChange={(e) => setJobForm({ ...jobForm, departmentId: e.target.value })}
                    required
                  >
                    <option value="">Select a department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Location
                  <input
                    type="text"
                    value={jobForm.location}
                    onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  />
                </label>
                <label>
                  Employment type
                  <input
                    type="text"
                    value={jobForm.employmentType}
                    onChange={(e) => setJobForm({ ...jobForm, employmentType: e.target.value })}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={jobForm.status}
                    onChange={(e) => setJobForm({ ...jobForm, status: e.target.value })}
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="rec-span">
                  Description
                  <textarea
                    rows={3}
                    value={jobForm.description}
                    onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                  />
                </label>
              </div>
              {jobFormError && <p className="rec-form-error">{jobFormError}</p>}
              <div className="rec-form-actions">
                <button className="rec-btn rec-btn-primary" disabled={jobFormBusy} type="submit">
                  {editingJobId ? 'Save changes' : 'Create job'}
                </button>
              </div>
            </form>
          )}
          <section className="rec-panel">
            {loading ? (
              <p className="rec-empty">Loading jobs…</p>
            ) : jobs.length === 0 ? (
              <p className="rec-empty">No jobs yet.</p>
            ) : (
              <table className="rec-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Department</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Applications</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <strong>{job.title}</strong>
                        {job.description && <span className="rec-sub">{job.description}</span>}
                      </td>
                      <td>{job.department ?? departmentName(job.departmentId)}</td>
                      <td>{job.location}</td>
                      <td>{job.employmentType}</td>
                      <td>{job.applicationsCount ?? applications.filter((a) => String(a.jobId) === String(job.id)).length}</td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        {isHR() && (
                          <div className="rec-actions">
                            <button
                              className="rec-btn rec-btn-outline"
                              onClick={() => openEditJob(job)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="rec-btn rec-btn-danger"
                              onClick={() => void deleteJob(job.id)}
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
        </>
      )}

      {tab === 'candidates' && (
        <section className="rec-panel">
          {loading ? (
            <p className="rec-empty">Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <p className="rec-empty">No candidates yet.</p>
          ) : (
            <table className="rec-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>CV</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td>
                      <strong>{candidate.name}</strong>
                    </td>
                    <td>{candidate.email}</td>
                    <td>{candidate.phone ?? '—'}</td>
                    <td>{candidate.hasCv ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="rec-actions">
                        {candidate.hasCv && (
                          <button
                            className="rec-btn rec-btn-outline"
                            onClick={() => void downloadCv(candidate)}
                            type="button"
                          >
                            Download CV
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
    </div>
  )
}

export default RecruitmentPage
