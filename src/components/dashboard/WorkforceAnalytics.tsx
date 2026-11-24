import { useId, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { translations, useI18n } from '../../contexts/I18nContext'
import type {
  Employee,
  Holiday,
  LeaveRequest,
  OffboardingRequest,
  OnboardingRequest,
} from '../../types/models'
import './WorkforceAnalytics.css'

// 0 = weeks start on Sunday (like the reference), 1 = Monday.
const WEEK_START = 0

// Colours are CSS variables from WorkforceAnalytics.css, so they follow the theme.
const seriesColors = [
  'var(--wa-c1, #3b82f6)',
  'var(--wa-c5, #22b8cf)',
  'var(--wa-c2, #8b7cf6)',
  'var(--wa-c3, #34d399)',
  'var(--wa-c4, #fbbf24)',
  'var(--wa-c6, #ec6aa6)',
]

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const prop = (record: unknown, key: string): unknown =>
  (record as Record<string, unknown>)[key]

const pad2 = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() - WEEK_START + 7) % 7))
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const parseDay = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const d = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const safeLocale = (language: string): string => {
  try {
    new Intl.DateTimeFormat(language)
    return language
  } catch {
    return 'en-US'
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

const smoothPath = (pts: { x: number; y: number }[]) =>
  pts
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`
      const prev = pts[i - 1]
      const mid = (prev.x + p.x) / 2
      return `C ${mid} ${prev.y} ${mid} ${p.y} ${p.x} ${p.y}`
    })
    .join(' ')

type LeaveSpan = { request: LeaveRequest; start: Date; end: Date }

// Approved and pending leave with valid dates.
const toSpans = (requests: LeaveRequest[]): LeaveSpan[] =>
  requests.flatMap((request) => {
    if (request.status !== 'approved' && request.status !== 'pending') return []
    const start = parseDay(request.start)
    const end = parseDay(request.end)
    if (!start || !end || end < start) return []
    return [{ request, start, end }]
  })

const employmentColor = (status: string): string => {
  const s = status.toLowerCase()
  if (s.includes('inactive') || s.includes('suspend') || s.includes('terminat')) return 'var(--wa-muted)'
  if (s.includes('leave')) return 'var(--wa-warning)'
  if (s.includes('prob')) return 'var(--wa-c5)'
  if (s.includes('active')) return 'var(--wa-success)'
  return 'var(--wa-c2)'
}

// -----------------------------------------------------------------------------
// Employee growth: headcount area + new hires line
// -----------------------------------------------------------------------------

type GrowthPoint = { label: string; full: string; headcount: number; hires: number }

function growthSeries(employees: Employee[], months: number, locale: string): GrowthPoint[] {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const joined = employees.map((employee) => parseDay(prop(employee, 'joined')))

  return Array.from({ length: months }, (_, i) => {
    const start = new Date(first.getFullYear(), first.getMonth() + i, 1)
    const end = new Date(first.getFullYear(), first.getMonth() + i + 1, 0, 23, 59, 59)
    let headcount = 0
    let hires = 0
    for (const date of joined) {
      // Employees without a valid join date count as already on board.
      if (!date || date <= end) headcount += 1
      if (date && date >= start && date <= end) hires += 1
    }
    return {
      label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(start),
      full: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start),
      headcount,
      hires,
    }
  })
}

function GrowthChart({ data, reducedMotion }: {
  data: GrowthPoint[]
  reducedMotion: boolean | null
}) {
  const uid = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)

  const width = 680
  const height = 250
  const left = 34
  const right = 14
  const top = 14
  const bottom = 32
  const plotW = width - left - right
  const plotH = height - top - bottom

  const peak = Math.max(0, ...data.map((d) => d.headcount))
  const niceMax = Math.max(4, Math.ceil(peak / 4) * 4)
  const ticks = [0, 1, 2, 3, 4].map((i) => (niceMax / 4) * i)

  const xOf = (i: number) =>
    left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW)
  const yOf = (v: number) => top + plotH - (v / niceMax) * plotH

  const head = data.map((d, i) => ({ x: xOf(i), y: yOf(d.headcount) }))
  const hire = data.map((d, i) => ({ x: xOf(i), y: yOf(d.hires) }))
  const headLine = smoothPath(head)
  const hireLine = smoothPath(hire)
  const baseline = top + plotH
  const area = `${headLine} L ${head.at(-1)?.x ?? left} ${baseline} L ${head[0]?.x ?? left} ${baseline} Z`
  const slot = data.length > 1 ? plotW / (data.length - 1) : plotW

  const current = active !== null ? data[active] : null
  const boxW = 156
  const boxH = 58
  const boxX = active !== null ? Math.min(Math.max(xOf(active) - boxW / 2, left), width - right - boxW) : 0

  return (
    <svg
      className="wa-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Employee growth: ${data.map((d) => `${d.label} headcount ${d.headcount}, hires ${d.hires}`).join('; ')}`}
    >
      <defs>
        <linearGradient id={`${uid}-area`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" className="wa-stop-accent" stopOpacity=".34" />
          <stop offset="100%" className="wa-stop-accent" stopOpacity=".03" />
        </linearGradient>
      </defs>

      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={yOf(tick)} y2={yOf(tick)} className="wa-grid-line" />
          <text x={left - 8} y={yOf(tick) + 4} textAnchor="end" className="wa-tick">{tick}</text>
        </g>
      ))}

      <path d={area} fill={`url(#${uid}-area)`} />
      <motion.path
        d={headLine}
        fill="none"
        className="wa-line-head"
        initial={reducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.8, ease: 'easeOut' }}
      />
      <motion.path
        d={hireLine}
        fill="none"
        className="wa-line-hires"
        initial={reducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.8, ease: 'easeOut', delay: reducedMotion ? 0 : 0.1 }}
      />

      {/* Permanent data-point markers on both lines (always visible, both themes). */}
      {head.map((p, i) => (
        <circle key={`head-${i}`} cx={p.x} cy={p.y} r={3.5} className="wa-point-head" />
      ))}
      {hire.map((p, i) => (
        <circle key={`hire-${i}`} cx={p.x} cy={p.y} r={3.5} className="wa-point-hires" />
      ))}

      {active !== null && (
        <g pointerEvents="none">
          <line x1={xOf(active)} x2={xOf(active)} y1={top} y2={baseline} className="wa-guide" />
          <circle cx={head[active].x} cy={head[active].y} r={5} className="wa-point-head" />
          <circle cx={hire[active].x} cy={hire[active].y} r={5} className="wa-point-hires" />
        </g>
      )}

      {data.map((d, i) => (
        <g key={d.full}>
          <text x={xOf(i)} y={height - 9} textAnchor="middle" className="wa-axis">{d.label}</text>
          <rect
            x={xOf(i) - slot / 2}
            y={0}
            width={slot}
            height={height}
            fill="transparent"
            tabIndex={0}
            aria-label={`${d.full}: headcount ${d.headcount}, ${d.hires} new hires`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        </g>
      ))}

      {current && (
        <g pointerEvents="none">
          <rect x={boxX} y={top} width={boxW} height={boxH} rx={8} className="wa-tip-bg" />
          <text x={boxX + 12} y={top + 18} className="wa-tip-title">{current.full}</text>
          <text x={boxX + 12} y={top + 35} className="wa-tip-text">{`Headcount: ${current.headcount}`}</text>
          <text x={boxX + 12} y={top + 50} className="wa-tip-text">{`New hires: ${current.hires}`}</text>
        </g>
      )}
    </svg>
  )
}

// -----------------------------------------------------------------------------
// Leave overview: stats, upcoming list, approved leave calendar
// -----------------------------------------------------------------------------

function LeaveOverview({ leaveRequests, spans, holidays, locale, onOpen }: {
  leaveRequests: LeaveRequest[]
  spans: LeaveSpan[]
  holidays: Holiday[]
  locale: string
  onOpen: () => void
}) {
  const [offset, setOffset] = useState(0)
  const today = startOfDay(new Date())
  const todayKey = keyOf(today)

  const count = (status: LeaveRequest['status']) =>
    leaveRequests.filter((request) => request.status === status).length
  const onLeaveNow = spans.filter(
    (s) => s.request.status === 'approved' && s.start <= today && s.end >= today,
  ).length

  const stats = [
    { label: 'On leave now', value: onLeaveNow, color: 'var(--wa-accent)' },
    { label: 'Pending', value: count('pending'), color: 'var(--wa-warning)' },
    { label: 'Approved', value: count('approved'), color: 'var(--wa-success)' },
    { label: 'Rejected', value: count('rejected'), color: 'var(--wa-danger)' },
  ]

  const upcoming = useMemo(
    () =>
      spans
        .filter((s) => s.end >= startOfDay(new Date()))
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 5),
    [spans],
  )

  const dayFmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })

  // Mini calendar
  const base = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const gridStart = startOfWeek(base)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  const { leaveByDay, holidayDays } = useMemo(() => {
    const now = startOfDay(new Date())
    const start = startOfWeek(new Date(now.getFullYear(), now.getMonth() + offset, 1))
    const end = addDays(start, 41)
    const leave = new Map<string, string[]>()
    for (const span of spans) {
      if (span.request.status !== 'approved') continue
      const first = span.start < start ? start : span.start
      const last = span.end > end ? end : span.end
      for (let d = first; d <= last; d = addDays(d, 1)) {
        const key = keyOf(d)
        leave.set(key, [...(leave.get(key) ?? []), String(span.request.employee)])
      }
    }
    const marks = new Set<string>()
    for (const holiday of holidays) {
      const d = parseDay(holiday.date)
      if (d) marks.add(keyOf(d))
    }
    return { leaveByDay: leave, holidayDays: marks }
  }, [spans, holidays, offset])

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' })
      .format(new Date(2026, 0, 4 + WEEK_START + i))
      .slice(0, 2),
  )
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(base)

  return (
    <div>
      <div className="wa-stats">
        {stats.map((item) => (
          <div className="wa-stat" key={item.label}>
            <strong style={{ color: item.color }}>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="wa-leave-body">
        <div>
          <h3 className="wa-sub">Upcoming leave</h3>
          {upcoming.length ? (
            <ul className="wa-up-list">
              {upcoming.map((span) => (
                <li key={span.request.id}>
                  <button type="button" className="wa-up-row" onClick={onOpen}>
                    <span className="avatar">{initials(String(span.request.employee))}</span>
                    <span className="wa-up-text">
                      <strong>{String(span.request.employee)}</strong>
                      <small>{`${String(span.request.type)} · ${dayFmt.format(span.start)} to ${dayFmt.format(span.end)}`}</small>
                    </span>
                    <span className={`status-badge ${span.request.status} wa-capitalize`}>{span.request.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="analytics-empty">No upcoming leave.</div>
          )}
        </div>

        <div>
          <h3 className="wa-sub">Approved leave calendar</h3>
          <div className="wa-mini-cal">
            <div className="wa-mini-head">
              <button type="button" className="wa-nav" aria-label="Previous month" onClick={() => setOffset(offset - 1)}>
                <ChevronLeft size={15} />
              </button>
              <strong>{title}</strong>
              <button type="button" className="wa-nav" aria-label="Next month" onClick={() => setOffset(offset + 1)}>
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="wa-mini-grid">
              {weekdays.map((name, i) => (
                <span key={`${name}-${i}`} className="wa-mini-dow">{name}</span>
              ))}
              {days.map((day) => {
                const key = keyOf(day)
                const names = leaveByDay.get(key)
                return (
                  <span
                    key={key}
                    className={[
                      'wa-mini-day',
                      day.getMonth() !== base.getMonth() ? 'is-out' : '',
                      key === todayKey ? 'is-today' : '',
                      names ? 'is-leave' : '',
                      holidayDays.has(key) ? 'is-holiday' : '',
                    ].join(' ')}
                    title={names ? names.join(', ') : undefined}
                  >
                    {day.getDate()}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


// -----------------------------------------------------------------------------
// Reference-style chart cards (used at the top of the redesigned dashboard)
// -----------------------------------------------------------------------------

/**
 * Line chart card: headcount (blue) vs new hires (orange), with legend chips
 * like the reference dashboard. Data comes from the employees' join dates.
 */
export function GrowthChartCard({
  employees,
  language,
}: {
  employees: Employee[]
  language: string
}) {
  const { language: uiLanguage } = useI18n()
  const t = translations[uiLanguage]
  const locale = safeLocale(language)
  const reducedMotion = useReducedMotion()
  const [range, setRange] = useState<6 | 12>(6)

  const growth = useMemo(() => growthSeries(employees, range, locale), [employees, range, locale])

  return (
    <article className="ref-chart-card" aria-label={t.employeeGrowth}>
      <div className="ref-chart-head">
        <div>
          <h2>{t.employeeGrowth}</h2>
          <p>{t.employeeGrowthNote}</p>
        </div>
        <div className="analytics-range" role="group" aria-label="Chart time range">
          {([6, 12] as const).map((months) => (
            <button
              key={months}
              type="button"
              className={range === months ? 'active' : ''}
              aria-pressed={range === months}
              onClick={() => setRange(months)}
            >
              {months}M
            </button>
          ))}
        </div>
      </div>
      {employees.length ? (
        <>
          <div className="analytics-chart-wrap">
            <GrowthChart data={growth} reducedMotion={reducedMotion} />
          </div>
          <div className="ref-legend-chips">
            <span className="ref-legend-chip">
              <i style={{ background: 'var(--wa-accent, #287be9)' }} />
              {t.headcount}
            </span>
            <span className="ref-legend-chip">
              <i style={{ background: 'var(--wa-warning, #d97706)' }} />
              {t.newHires}
            </span>
          </div>
        </>
      ) : (
        <div className="analytics-empty">No employee data available yet.</div>
      )}
    </article>
  )
}

/**
 * Donut card: employees by department, with the interactive legend from the
 * existing breakdown. The centre shows the hovered department (or the total).
 */
export function DepartmentDonutCard({ employees }: { employees: Employee[] }) {
  const { language } = useI18n()
  const t = translations[language]
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null)

  const departments = useMemo(() => {
    const counts = new Map<string, number>()
    for (const employee of employees) {
      const name = String(employee.department || 'Unassigned')
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [employees])
  const departmentTotal = departments.reduce((sum, [, n]) => sum + n, 0)
  const selectedDepartment = departments.find(([name]) => name === activeDepartment)
  const circumference = 100

  return (
    <article className="ref-chart-card" aria-label={t.departmentDistribution}>
      <div className="ref-chart-head">
        <div>
          <h2>{t.departmentDistribution}</h2>
          <p>{t.departmentDistributionNote}</p>
        </div>
      </div>
      {departmentTotal ? (
        <>
          <div className="wa-donut-box">
            <svg viewBox="0 0 42 42" role="img" aria-label="Employee distribution by department">
              <circle cx="21" cy="21" r="15.915" className="wa-donut-track" />
              {departments.map(([name, count], index) => {
                const value = (count / departmentTotal) * circumference
                const drawn = Math.max(value - 0.8, 0)
                const offset = departments
                  .slice(0, index)
                  .reduce((sum, [, prior]) => sum + (prior / departmentTotal) * circumference, 0)
                return (
                  <circle
                    key={name}
                    cx="21"
                    cy="21"
                    r="15.915"
                    className={[
                      'wa-donut-seg',
                      activeDepartment === name ? 'is-active' : '',
                      activeDepartment && activeDepartment !== name ? 'is-dim' : '',
                    ].join(' ')}
                    style={{ stroke: seriesColors[index % seriesColors.length] }}
                    strokeDasharray={`${drawn} ${circumference - drawn}`}
                    strokeDashoffset={-offset}
                    onMouseEnter={() => setActiveDepartment(name)}
                    onMouseLeave={() => setActiveDepartment(null)}
                  >
                    <title>{`${name}: ${count} employees`}</title>
                  </circle>
                )
              })}
              <text x="21" y="21.5" className="wa-donut-value">{selectedDepartment?.[1] ?? departmentTotal}</text>
              <text x="21" y="26" className="wa-donut-label">{selectedDepartment?.[0] ?? t.employeesWord}</text>
            </svg>
          </div>
          <ul className="wa-legend wa-scroll">
            {departments.map(([name, count], index) => (
              <li key={name}>
                <button
                  type="button"
                  className={[
                    'wa-legend-row',
                    activeDepartment && activeDepartment !== name ? 'is-dim' : '',
                  ].join(' ')}
                  onMouseEnter={() => setActiveDepartment(name)}
                  onMouseLeave={() => setActiveDepartment(null)}
                  onFocus={() => setActiveDepartment(name)}
                  onBlur={() => setActiveDepartment(null)}
                  aria-label={`${name}: ${count} employees`}
                >
                  <i className="wa-swatch wa-round" style={{ background: seriesColors[index % seriesColors.length] }} />
                  <span className="wa-legend-label">{name}</span>
                  <span className="wa-count">{count}</span>
                  <strong>{((count / departmentTotal) * 100).toFixed(1)}%</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="analytics-empty">No department data available yet.</div>
      )}
    </article>
  )
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------

export function WorkforceAnalytics({
  employees,
  leaveRequests,
  holidays = [],
  onboardingRequests,
  offboardingRequests,
  language,
}: {
  employees: Employee[]
  leaveRequests: LeaveRequest[]
  holidays?: Holiday[]
  onboardingRequests: OnboardingRequest[]
  offboardingRequests: OffboardingRequest[]
  language: string
}) {
  const navigate = useNavigate()
  const locale = safeLocale(language)
  const reducedMotion = useReducedMotion()

  const spans = useMemo(() => toSpans(leaveRequests), [leaveRequests])

  const departments = useMemo(() => {
    const counts = new Map<string, number>()
    for (const employee of employees) {
      const name = String(employee.department || 'Unassigned')
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [employees])
  const departmentTotal = departments.reduce((sum, [, n]) => sum + n, 0)

  const employment = useMemo(() => {
    const counts = new Map<string, number>()
    for (const employee of employees) {
      const raw = prop(employee, 'status')
      const label = typeof raw === 'string' && raw.trim() ? raw.trim() : 'Unknown'
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [employees])

  const today = startOfDay(new Date())
  const onLeaveNow = spans.filter(
    (s) => s.request.status === 'approved' && s.start <= today && s.end >= today,
  ).length

  const activeOnboarding = onboardingRequests.filter(
    (request) => request.stage !== 'Completed' && request.status !== 'Completed',
  )
  const averageProgress = activeOnboarding.length
    ? Math.round(activeOnboarding.reduce((sum, request) => sum + request.progress, 0) / activeOnboarding.length)
    : 0
  const activeOffboarding = offboardingRequests.filter((request) => request.status !== 'Completed')
  const offboardingProgress = activeOffboarding.length
    ? Math.round(activeOffboarding.reduce((sum, request) => sum + request.progress, 0) / activeOffboarding.length)
    : 0

  const maxDept = Math.max(1, ...departments.map(([, n]) => n))
  const maxStatus = Math.max(1, ...employment.map(([, n]) => n))

  return (
    <section className="analytics-grid wa" aria-label="Workforce analytics">
      {/* ---------------------------- Leave overview --------------------------- */}
      <article className="panel analytics-panel">
        <div className="analytics-heading">
          <div>
            <h2>Leave overview</h2>
            <p>Requests, upcoming absences and approved leave</p>
          </div>
          <button type="button" className="text-button" onClick={() => navigate('/app/leave/requests')}>
            View all <ChevronRight size={13} />
          </button>
        </div>
        <LeaveOverview
          leaveRequests={leaveRequests}
          spans={spans}
          holidays={holidays}
          locale={locale}
          onOpen={() => navigate('/app/leave/requests')}
        />
      </article>

      {/* --------------------------- Employment status ------------------------- */}
      <article className="panel analytics-panel">
        <div className="analytics-heading">
          <div>
            <h2>Employment status</h2>
            <p>Employees by current status</p>
          </div>
        </div>
        {employment.length ? (
          <ul className="wa-rows">
            {employment.map(([label, count]) => (
              <li className="wa-row" key={label}>
                <span className="wa-row-label wa-capitalize" title={label}>{label}</span>
                <span className="wa-bar-track">
                  <motion.span
                    className="wa-bar-fill"
                    style={{ background: employmentColor(label) }}
                    initial={reducedMotion ? false : { width: 0 }}
                    animate={{ width: `${(count / maxStatus) * 100}%` }}
                    transition={{ duration: reducedMotion ? 0 : 0.6, ease: 'easeOut' }}
                  />
                </span>
                <span className="wa-row-value">{count}</span>
              </li>
            ))}
          </ul>
        ) : <div className="analytics-empty">No employee data available yet.</div>}
      </article>

      {/* ----------------------------- Workflow progress ----------------------- */}
      <article className="panel analytics-panel analytics-lifecycle">
        <div className="analytics-heading">
          <div>
            <h2>Workflow progress</h2>
            <p>Progress from active requests</p>
          </div>
        </div>
        <div className="wa-progress-list">
          {[
            { label: 'Onboarding', count: activeOnboarding.length, progress: averageProgress, color: 'var(--wa-c1)' },
            { label: 'Offboarding', count: activeOffboarding.length, progress: offboardingProgress, color: 'var(--wa-c2)' },
          ].map((item) => (
            <div className="wa-progress-item" key={item.label}>
              <div className="wa-progress-meta">
                <span>{item.label}</span>
                <strong>{item.count} active · {item.progress}%</strong>
              </div>
              <div
                className="wa-progress-track"
                role="progressbar"
                aria-label={`${item.label} progress`}
                aria-valuenow={item.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <motion.span
                  style={{ background: item.color }}
                  initial={reducedMotion ? false : { width: 0 }}
                  animate={{ width: `${item.progress}%` }}
                  transition={{ duration: reducedMotion ? 0 : 0.7, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
          {!onboardingRequests.length && !offboardingRequests.length && (
            <div className="analytics-empty">No workflow data available yet.</div>
          )}
        </div>
      </article>

      {/* --------------------------- Organization overview --------------------- */}
      <article className="panel analytics-panel">
        <div className="analytics-heading">
          <div>
            <h2>Organization overview</h2>
            <p>Structure at a glance</p>
          </div>
        </div>
        {departmentTotal ? (
          <>
            <div className="wa-org-stats">
              <div><strong>{departments.length}</strong><span>Departments</span></div>
              <div><strong>{employees.length}</strong><span>Employees</span></div>
              <div><strong>{onLeaveNow}</strong><span>On leave</span></div>
            </div>
            <ul className="wa-org-list">
              {departments.slice(0, 5).map(([name, count]) => (
                <li key={name}>
                  <div className="wa-org-line">
                    <span>{name}</span>
                    <small>{count}</small>
                  </div>
                  <span className="wa-bar-track wa-thick">
                    <motion.span
                      className="wa-bar-fill"
                      style={{ background: 'var(--wa-accent)' }}
                      initial={reducedMotion ? false : { width: 0 }}
                      animate={{ width: `${(count / maxDept) * 100}%` }}
                      transition={{ duration: reducedMotion ? 0 : 0.6, ease: 'easeOut' }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : <div className="analytics-empty">No organization data available yet.</div>}
      </article>
    </section>
  )
}