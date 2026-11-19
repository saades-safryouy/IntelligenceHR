import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Award,
  Cake,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Flag,
  LogOut,
  Plane,
  Plus,
  Search,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { downloadFile } from '../../components/dashboard/DashboardUtils'
import {
  employeeRepository,
  holidayRepository,
  leaveRequestRepository,
} from '../../data/mockRepository'
import { getEmployees, getHolidays, getLeaveRequests } from '../../data/employeeStore'
import { isApiDataMode } from '../../lib/apiClient'
import { useI18n } from '../../contexts/I18nContext'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import type { Employee, Holiday, LeaveRequest } from '../../types/models'
import { LoadingState } from '../../components/ui/LoadingState'
import './CalendarPage.css'

// -----------------------------------------------------------------------------
// Settings you may want to change
// -----------------------------------------------------------------------------

// 0 = weeks start on Sunday, 1 = Monday.
const WEEK_START = 1
const STORAGE_KEY = 'hr-calendar-custom-events'

// Field names tried (in order) when reading dates from employee records.
const BIRTHDAY_KEYS = ['birthDate', 'birthday', 'dateOfBirth', 'dob']
const DEPARTURE_KEYS = ['endDate', 'exitDate', 'terminationDate', 'leftAt', 'lastWorkingDay', 'lastDay', 'departureDate']
const TITLE_KEYS = ['title', 'jobTitle', 'position', 'role']

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Category = 'leave' | 'holiday' | 'birthday' | 'anniversary' | 'joiner' | 'departure' | 'event'
type View = 'month' | 'week' | 'agenda'

type CalEvent = {
  id: string
  category: Category
  title: string
  subtitle: string
  start: Date
  end: Date // inclusive, day precision
  person?: string
  department?: string
  status?: string
  custom?: boolean
}

type UserEvent = {
  id: string
  title: string
  type: string
  start: string // YYYY-MM-DD
  end: string
  note: string
}

const CATEGORY_ORDER: Category[] = ['holiday', 'event', 'leave', 'departure', 'joiner', 'birthday', 'anniversary']

const CATEGORY_META: Record<Category, { label: string; icon: ReactNode }> = {
  leave: { label: 'Leave', icon: <Plane size={14} /> },
  holiday: { label: 'Holidays', icon: <Flag size={14} /> },
  birthday: { label: 'Birthdays', icon: <Cake size={14} /> },
  anniversary: { label: 'Anniversaries', icon: <Award size={14} /> },
  joiner: { label: 'New joiners', icon: <UserPlus size={14} /> },
  departure: { label: 'Departures', icon: <LogOut size={14} /> },
  event: { label: 'Company events', icon: <Star size={14} /> },
}

const EVENT_TYPES = ['Meeting', 'Company event', 'Training', 'Deadline', 'Other']

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const prop = (record: unknown, key: string): unknown => (record as Record<string, unknown>)[key]

const pickText = (record: unknown, keys: string[], fallback = ''): string => {
  for (const key of keys) {
    const value = prop(record, key)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return fallback
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() - WEEK_START + 7) % 7))
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

const parseDay = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const d = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

const pickDate = (record: unknown, keys: string[]): Date | null => {
  for (const key of keys) {
    const d = parseDay(prop(record, key))
    if (d) return d
  }
  return null
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

const employeeName = (employee: unknown): string => {
  const direct = pickText(employee, ['name', 'fullName'])
  if (direct) return direct
  const joined = `${pickText(employee, ['firstName'])} ${pickText(employee, ['lastName'])}`.trim()
  return joined || 'Employee'
}

// Turn ids / nested objects (e.g. a department record) from the API into plain strings.
const toId = (id: unknown): string => {
  if (typeof id === 'string' || typeof id === 'number') return String(id)
  if (id && typeof id === 'object') {
    const o = id as Record<string, unknown>
    return String(o.$oid ?? o.id ?? o.value ?? JSON.stringify(id))
  }
  return String(id)
}

const toName = (value: unknown): string => {
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return String(o.name ?? o.code ?? o.id ?? '')
  }
  return value == null ? '' : String(value)
}

const normalizeRecord = <T extends { id: unknown }>(record: T): T => {
  const out: Record<string, unknown> = { ...record }
  for (const [key, value] of Object.entries(out)) {
    if (key === 'id') out.id = toId(value)
    else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ('name' in value || 'code' in value || 'id' in value)
    ) {
      out[key] = toName(value)
    }
  }
  return out as T
}

const normalizeList = <T extends { id: unknown }>(list: T[] | undefined): T[] =>
  (list ?? []).map(normalizeRecord)

const isUserEvent = (value: unknown): value is UserEvent =>
  !!value &&
  typeof value === 'object' &&
  ['id', 'title', 'type', 'start', 'end', 'note'].every(
    (key) => typeof (value as Record<string, unknown>)[key] === 'string',
  )

const loadUserEvents = (): UserEvent[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isUserEvent) : []
  } catch {
    return []
  }
}

const icsEscape = (text: string) => text.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

const toIcs = (events: CalEvent[]): string => {
  const fmt = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IntelligenceHR//Calendar//EN']
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@intelligencehr`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${fmt(event.start)}`,
      `DTEND;VALUE=DATE:${fmt(addDays(event.end, 1))}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(event.subtitle)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

// -----------------------------------------------------------------------------
// Build calendar events for a date range
// -----------------------------------------------------------------------------

function buildEvents(args: {
  employees: Employee[]
  leaveRequests: LeaveRequest[]
  holidays: Holiday[]
  custom: UserEvent[]
  rangeStart: Date
  rangeEnd: Date
  locale: string
}): CalEvent[] {
  const { employees, leaveRequests, holidays, custom, rangeStart, rangeEnd, locale } = args
  const events: CalEvent[] = []
  const inRange = (start: Date, end: Date) => end >= rangeStart && start <= rangeEnd
  const short = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })

  const departmentOf = new Map<string, string>()
  for (const employee of employees) {
    departmentOf.set(employeeName(employee), String(prop(employee, 'department') ?? ''))
  }

  // Leave (approved and pending)
  for (const request of leaveRequests) {
    if (request.status !== 'approved' && request.status !== 'pending') continue
    const start = parseDay(request.start)
    const end = parseDay(request.end)
    if (!start || !end || end < start || !inRange(start, end)) continue
    const person = String(request.employee)
    events.push({
      id: `leave-${request.id}`,
      category: 'leave',
      title: `${person} · ${String(request.type)}`,
      subtitle: `${short.format(start)}${dayDiff(start, end) ? ` – ${short.format(end)}` : ''}`,
      start,
      end,
      person,
      department: departmentOf.get(person) ?? '',
      status: request.status,
    })
  }

  // Holidays
  for (const holiday of holidays) {
    const date = parseDay(holiday.date)
    if (!date || !inRange(date, date)) continue
    events.push({
      id: `holiday-${holiday.id}`,
      category: 'holiday',
      title: holiday.name,
      subtitle: `${holiday.type} holiday${holiday.site ?? holiday.country ? ` · ${holiday.site ?? holiday.country}` : ''}`,
      start: date,
      end: date,
    })
  }

  // People milestones
  const years = new Set([rangeStart.getFullYear(), rangeEnd.getFullYear()])
  for (const employee of employees) {
    const id = String(prop(employee, 'id'))
    const name = employeeName(employee)
    const department = String(prop(employee, 'department') ?? '')
    const role = pickText(employee, TITLE_KEYS)

    const birth = pickDate(employee, BIRTHDAY_KEYS)
    if (birth) {
      for (const year of years) {
        const date = new Date(year, birth.getMonth(), birth.getDate())
        if (inRange(date, date)) {
          events.push({
            id: `birthday-${id}-${year}`,
            category: 'birthday',
            title: `${name}'s birthday`,
            subtitle: department || 'Birthday',
            start: date,
            end: date,
            person: name,
            department,
          })
        }
      }
    }

    const joined = pickDate(employee, ['joined'])
    if (joined) {
      if (inRange(joined, joined)) {
        events.push({
          id: `joiner-${id}`,
          category: 'joiner',
          title: `${name} joins`,
          subtitle: [role, department].filter(Boolean).join(' · ') || 'New joiner',
          start: joined,
          end: joined,
          person: name,
          department,
        })
      }
      for (const year of years) {
        const yearsOfService = year - joined.getFullYear()
        if (yearsOfService < 1) continue
        const date = new Date(year, joined.getMonth(), joined.getDate())
        if (inRange(date, date)) {
          events.push({
            id: `anniversary-${id}-${year}`,
            category: 'anniversary',
            title: `${name} · ${yearsOfService} ${yearsOfService === 1 ? 'year' : 'years'}`,
            subtitle: 'Work anniversary',
            start: date,
            end: date,
            person: name,
            department,
          })
        }
      }
    }

    const left = pickDate(employee, DEPARTURE_KEYS)
    if (left && inRange(left, left)) {
      events.push({
        id: `departure-${id}`,
        category: 'departure',
        title: `${name} · last day`,
        subtitle: department || 'Departure',
        start: left,
        end: left,
        person: name,
        department,
      })
    }
  }

  // Events created in this calendar
  for (const item of custom) {
    const start = parseDay(item.start)
    const end = parseDay(item.end) ?? start
    if (!start || !end || !inRange(start, end)) continue
    events.push({
      id: `custom-${item.id}`,
      category: 'event',
      title: item.title,
      subtitle: [item.type, item.note].filter(Boolean).join(' · '),
      start,
      end: end < start ? start : end,
      custom: true,
    })
  }

  return events
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export function CalendarPage() {
  // ---- hooks (all before any early return) ----
  useEmployeeStore()
  const { language } = useI18n()
  const locale = safeLocale(language)

  const [isLoading, setIsLoading] = useState(isApiDataMode)
  const [employees, setEmployees] = useState<Employee[]>(() => (!isApiDataMode ? getEmployees() : []))
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => (!isApiDataMode ? getLeaveRequests() : []))
  const [holidays, setHolidays] = useState<Holiday[]>(() => (!isApiDataMode ? getHolidays() : []))

  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [selected, setSelected] = useState(() => keyOf(new Date()))
  const [active, setActive] = useState<Set<Category>>(() => new Set(CATEGORY_ORDER))
  const [department, setDepartment] = useState('all')
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState<UserEvent[]>(loadUserEvents)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [form, setForm] = useState({ title: '', type: EVENT_TYPES[0], start: '', end: '', note: '' })
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let live = true
    if (isApiDataMode) setIsLoading(true)
    Promise.all([
      employeeRepository.list().catch(() => ({ data: getEmployees() })),
      leaveRequestRepository.list().catch(() => ({ data: getLeaveRequests() })),
      holidayRepository.list().catch(() => ({ data: getHolidays() })),
    ])
      .then(([employeeRes, leaveRes, holidayRes]) => {
        if (!live) return
        setEmployees(normalizeList(employeeRes.data))
        setLeaveRequests(normalizeList(leaveRes.data))
        setHolidays(normalizeList(holidayRes.data))
      })
      .catch((err: unknown) => {
        console.error('Failed to load calendar data:', err)
        if (!live) return
        setEmployees(getEmployees())
        setLeaveRequests(getLeaveRequests())
        setHolidays(getHolidays())
      })
      .finally(() => {
        if (live) setIsLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
    } catch {
      /* storage unavailable: events stay in memory only */
    }
  }, [custom])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Visible date range for the current view
  const range = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(cursor)
      return { start, end: addDays(start, 6), days: 7 }
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const start = startOfWeek(first)
    const weeks = Math.ceil((dayDiff(start, first) + last.getDate()) / 7)
    return { start, end: addDays(start, weeks * 7 - 1), days: weeks * 7 }
  }, [view, cursor])

  const allEvents = useMemo(
    () =>
      buildEvents({
        employees,
        leaveRequests,
        holidays,
        custom,
        rangeStart: range.start,
        rangeEnd: range.end,
        locale,
      }),
    [employees, leaveRequests, holidays, custom, range, locale],
  )

  const departments = useMemo(
    () => [...new Set(employees.map((e) => String(prop(e, 'department') ?? '')).filter(Boolean))].sort(),
    [employees],
  )

  // After department + search, before category toggles (used for the chip counts)
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allEvents.filter((event) => {
      if (department !== 'all' && event.department !== undefined && event.department !== department) return false
      if (q && !`${event.title} ${event.subtitle} ${event.person ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [allEvents, department, query])

  const counts = useMemo(() => {
    const map = new Map<Category, number>()
    for (const event of scoped) map.set(event.category, (map.get(event.category) ?? 0) + 1)
    return map
  }, [scoped])

  const visible = useMemo(() => scoped.filter((event) => active.has(event.category)), [scoped, active])

  // Events grouped per day, sorted by category priority
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const event of visible) {
      const first = event.start < range.start ? range.start : event.start
      const last = event.end > range.end ? range.end : event.end
      for (let d = first; d <= last; d = addDays(d, 1)) {
        const key = keyOf(d)
        map.set(key, [...(map.get(key) ?? []), event])
      }
    }
    const rank = (event: CalEvent) =>
      CATEGORY_ORDER.indexOf(event.category) * 2 + (event.status === 'pending' ? 1 : 0)
    for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    return map
  }, [visible, range])

  // Coverage: days with many people out
  const threshold = Math.max(2, Math.ceil(employees.length * 0.2))
  const outCount = (key: string) =>
    new Set(
      (byDay.get(key) ?? [])
        .filter((e) => e.category === 'leave' && e.status === 'approved')
        .map((e) => e.person),
    ).size
  const busiest = useMemo(() => {
    const rows: { key: string; count: number }[] = []
    for (const key of byDay.keys()) {
      const count = new Set(
        (byDay.get(key) ?? [])
          .filter((e) => e.category === 'leave' && e.status === 'approved')
          .map((e) => e.person),
      ).size
      if (count >= threshold) rows.push({ key, count })
    }
    return rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 4)
  }, [byDay, threshold])

  // Summary cards (always about "now", independent of the visible month)
  const summary = useMemo(() => {
    const today = startOfDay(new Date())
    const out = leaveRequests.filter((request) => {
      if (request.status !== 'approved') return false
      const start = parseDay(request.start)
      const end = parseDay(request.end)
      return !!start && !!end && start <= today && end >= today
    })
    const pending = leaveRequests.filter((request) => request.status === 'pending').length
    const soon = holidays.filter((holiday) => {
      const date = parseDay(holiday.date)
      return !!date && date >= today && dayDiff(today, date) <= 30
    }).length
    const birthdays = employees.filter((employee) => {
      const birth = pickDate(employee, BIRTHDAY_KEYS)
      return !!birth && birth.getMonth() === today.getMonth()
    }).length
    return { out, pending, soon, birthdays }
  }, [leaveRequests, holidays, employees])

  // ---- early return (after every hook) ----
  if (isApiDataMode && isLoading) {
    return (
      <LoadingState />
    )
  }

  // ---- derived values for rendering ----
  const todayKey = keyOf(new Date())
  const selectedDate = parseDay(selected) ?? startOfDay(new Date())
  const selectedEvents = byDay.get(selected) ?? []
  const fmtDay = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  const fmtShort = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 0, 4 + WEEK_START + i)),
  )

  const title =
    view === 'week'
      ? `${fmtShort.format(range.start)} – ${fmtShort.format(range.end)}, ${range.end.getFullYear()}`
      : fmtMonth.format(cursor)

  const days = Array.from({ length: range.days }, (_, i) => addDays(range.start, i))

  const move = (direction: -1 | 1) => {
    const next =
      view === 'week'
        ? addDays(cursor, direction * 7)
        : new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
    setCursor(next)
    const now = new Date()
    const sameMonth = next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth()
    setSelected(keyOf(view !== 'week' && sameMonth ? now : next))
  }

  const goToday = () => {
    const now = startOfDay(new Date())
    setCursor(now)
    setSelected(keyOf(now))
  }

  const toggleCategory = (category: Category) => {
    setActive((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const openDrawer = (key: string) => {
    setForm({ title: '', type: EVENT_TYPES[0], start: key, end: '', note: '' })
    setFormError('')
    setDrawerOpen(true)
  }

  const saveEvent = () => {
    const titleText = form.title.trim()
    if (!titleText) return setFormError('Please enter a title.')
    if (!form.start) return setFormError('Please choose a start date.')
    if (form.end && form.end < form.start) return setFormError('The end date cannot be before the start date.')
    setCustom((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: titleText,
        type: form.type,
        start: form.start,
        end: form.end || form.start,
        note: form.note.trim(),
      },
    ])
    const start = parseDay(form.start)
    if (start) {
      setCursor(start)
      setSelected(form.start)
    }
    setDrawerOpen(false)
  }

  const removeEvent = (event: CalEvent) => {
    if (!event.custom) return
    const id = event.id.replace(/^custom-/, '')
    setCustom((current) => current.filter((item) => item.id !== id))
  }

  const exportIcs = () => {
    const stamp = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`
    downloadFile(toIcs(visible), `hr-calendar-${stamp}.ics`, 'text/calendar')
  }

  // ---- small render helpers ----
  const pill = (event: CalEvent, key: string) => (
    <span
      key={key}
      className={`hc-pill cat-${event.category} ${event.status === 'pending' ? 'is-pending' : ''}`}
      title={`${event.title}${event.status ? ` (${event.status})` : ''}`}
    >
      {event.title}
    </span>
  )

  const eventRow = (event: CalEvent) => (
    <li className={`hc-item cat-${event.category}`} key={event.id}>
      <span className="hc-item-icon">{CATEGORY_META[event.category].icon}</span>
      <div className="hc-item-text">
        <strong>{event.title}</strong>
        <small>{[CATEGORY_META[event.category].label, event.subtitle].filter(Boolean).join(' · ')}</small>
      </div>
      {event.status && <span className={`status-badge ${event.status} hc-cap`}>{event.status}</span>}
      {event.custom && (
        <button
          type="button"
          className="hc-icon-btn"
          aria-label={`Delete ${event.title}`}
          onClick={() => removeEvent(event)}
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  )

  const agendaDays = days.filter(
    (day) => day.getMonth() === cursor.getMonth() && (byDay.get(keyOf(day))?.length ?? 0) > 0,
  )

  return (
    <div className="page hc">
      <PageHeader
        eyebrow="PLANNING HUB"
        title="HR calendar"
        subtitle="Leave, holidays and people milestones in one shared view."
      >
        <button className="button secondary" onClick={exportIcs}>
          <Download size={16} />
          Export .ics
        </button>
        <button className="button primary" onClick={() => openDrawer(selected)}>
          <Plus size={16} />
          Add event
        </button>
      </PageHeader>

      <div className="directory-summary">
        <div>
          <span>On leave today</span>
          <strong>{summary.out.length}</strong>
          <small>of {employees.length} employees</small>
        </div>
        <div>
          <span>Pending leave requests</span>
          <strong className={summary.pending ? 'orange-text' : ''}>{summary.pending}</strong>
          <small>waiting for a decision</small>
        </div>
        <div>
          <span>Holidays, next 30 days</span>
          <strong>{summary.soon}</strong>
          <small>from the organization calendar</small>
        </div>
        <div>
          <span>Birthdays this month</span>
          <strong>{summary.birthdays}</strong>
          <small>celebrate your people</small>
        </div>
      </div>

      <div className="hc-layout">
        <section className="panel calendar-panel hc-main">
          <div className="calendar-toolbar">
            <button className="icon-button" aria-label="Previous" onClick={() => move(-1)}>
              <ChevronLeft size={17} />
            </button>
            <button className="icon-button" aria-label="Next" onClick={() => move(1)}>
              <ChevronRight size={17} />
            </button>
            <strong className="hc-title">{title}</strong>
            <button className="hc-chip hc-today" onClick={goToday}>Today</button>

            <div className="view-switch" role="group" aria-label="Calendar view">
              {(['month', 'week', 'agenda'] as const).map((item) => (
                <button
                  key={item}
                  className={view === item ? 'active' : ''}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                >
                  {item === 'month' ? 'Month' : item === 'week' ? 'Week' : 'Agenda'}
                </button>
              ))}
            </div>
          </div>

          <div className="hc-filters">
            <div className="hc-chips" role="group" aria-label="Event types">
              {CATEGORY_ORDER.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`hc-chip cat-${category} ${active.has(category) ? 'is-on' : ''}`}
                  aria-pressed={active.has(category)}
                  onClick={() => toggleCategory(category)}
                >
                  <i className="hc-dot" />
                  {CATEGORY_META[category].label}
                  <small>{counts.get(category) ?? 0}</small>
                </button>
              ))}
            </div>
            <div className="hc-filter-row">
              <label className="hc-search">
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Search people or events"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search calendar"
                />
              </label>
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                aria-label="Filter by department"
              >
                <option value="all">All departments</option>
                {departments.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {view === 'month' && (
            <div className="hc-grid" role="grid" aria-label={title}>
              {weekdays.map((name) => (
                <span key={name} className="hc-dow">{name}</span>
              ))}
              {days.map((day) => {
                const key = keyOf(day)
                const list = byDay.get(key) ?? []
                const out = outCount(key)
                const shown = list.slice(0, 3)
                const more = list.length - shown.length
                const categories = [...new Set(list.map((e) => e.category))]
                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      'hc-cell',
                      day.getMonth() !== cursor.getMonth() ? 'is-out' : '',
                      key === todayKey ? 'is-today' : '',
                      key === selected ? 'is-selected' : '',
                      out >= threshold ? 'is-busy' : '',
                    ].join(' ')}
                    aria-pressed={key === selected}
                    aria-label={`${fmtDay.format(day)}: ${list.length} events`}
                    onClick={() => setSelected(key)}
                    onDoubleClick={() => openDrawer(key)}
                  >
                    <span className="hc-cell-top">
                      <span className="hc-daynum">{day.getDate()}</span>
                      {out >= threshold && <span className="hc-busy">{out} out</span>}
                    </span>
                    <span className="hc-pills">
                      {shown.map((event) => pill(event, `${key}-${event.id}`))}
                      {more > 0 && <span className="hc-more">+{more} more</span>}
                    </span>
                    <span className="hc-dots">
                      {categories.map((category) => (
                        <i key={category} className={`hc-dot cat-${category}`} />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {view === 'week' && (
            <div className="hc-week">
              {days.map((day) => {
                const key = keyOf(day)
                const list = byDay.get(key) ?? []
                return (
                  <div
                    key={key}
                    className={`hc-week-col ${key === todayKey ? 'is-today' : ''} ${key === selected ? 'is-selected' : ''}`}
                  >
                    <button type="button" className="hc-week-head" onClick={() => setSelected(key)} onDoubleClick={() => openDrawer(key)}>
                      <small>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day)}</small>
                      <strong>{day.getDate()}</strong>
                    </button>
                    <div className="hc-week-list">
                      {list.length ? (
                        list.map((event) => (
                          <button
                            type="button"
                            key={event.id}
                            className={`hc-card cat-${event.category} ${event.status === 'pending' ? 'is-pending' : ''}`}
                            onClick={() => setSelected(key)}
                          >
                            <strong>{event.title}</strong>
                            <small>{event.subtitle}</small>
                          </button>
                        ))
                      ) : (
                        <span className="hc-empty-day">—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {view === 'agenda' && (
            <div className="hc-agenda">
              {agendaDays.length ? (
                agendaDays.map((day) => {
                  const key = keyOf(day)
                  return (
                    <section className="hc-agenda-day" key={key}>
                      <button type="button" className="hc-agenda-date" onClick={() => setSelected(key)}>
                        <strong>{day.getDate()}</strong>
                        <small>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day)}</small>
                      </button>
                      <ul className="hc-list">{(byDay.get(key) ?? []).map(eventRow)}</ul>
                    </section>
                  )
                })
              ) : (
                <div className="empty-state">Nothing scheduled this month for the selected filters.</div>
              )}
            </div>
          )}
        </section>

        <aside className="hc-aside">
          <section className="panel hc-card-panel">
            <div className="hc-aside-head">
              <div>
                <h2>{fmtDay.format(selectedDate)}</h2>
                <p>{selectedEvents.length ? `${selectedEvents.length} scheduled` : 'Nothing scheduled'}</p>
              </div>
              <button type="button" className="hc-icon-btn" aria-label="Add event on this day" onClick={() => openDrawer(selected)}>
                <Plus size={16} />
              </button>
            </div>
            {selectedEvents.length ? (
              <ul className="hc-list">{selectedEvents.map(eventRow)}</ul>
            ) : (
              <div className="empty-state">Double-click a day, or press + to add an event.</div>
            )}
          </section>

          <section className="panel hc-card-panel">
            <div className="hc-aside-head">
              <div>
                <h2>Who is out today</h2>
                <p>{summary.out.length} of {employees.length} employees</p>
              </div>
            </div>
            {summary.out.length ? (
              <ul className="hc-people">
                {summary.out.map((request) => (
                  <li key={String(request.id)}>
                    <span className="avatar">{initials(String(request.employee))}</span>
                    <div>
                      <strong>{String(request.employee)}</strong>
                      <small>{String(request.type)} · back {fmtShort.format(addDays(parseDay(request.end) ?? new Date(), 1))}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">Everyone is in today.</div>
            )}
          </section>

          <section className="panel hc-card-panel">
            <div className="hc-aside-head">
              <div>
                <h2>Coverage alerts</h2>
                <p>Days with {threshold}+ people out</p>
              </div>
            </div>
            {busiest.length ? (
              <ul className="hc-alerts">
                {busiest.map((row) => {
                  const date = parseDay(row.key) ?? new Date()
                  return (
                    <li key={row.key}>
                      <button type="button" onClick={() => { setSelected(row.key); setCursor(date) }}>
                        <span>{fmtDay.format(date)}</span>
                        <strong>{row.count} out</strong>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="empty-state">No coverage risks in this period.</div>
            )}
          </section>
        </aside>
      </div>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div
            className="employee-drawer hc-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Add calendar event"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <span>NEW EVENT</span>
              <button className="icon-button" aria-label="Close" onClick={() => setDrawerOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="leave-form">
              <label>
                Title
                <input
                  autoFocus
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Quarterly town hall"
                />
              </label>
              <label>
                Type
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                  {EVENT_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <div className="hc-form-row">
                <label>
                  Start date
                  <input type="date" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
                </label>
                <label>
                  End date (optional)
                  <input type="date" value={form.end} min={form.start} onChange={(event) => setForm({ ...form, end: event.target.value })} />
                </label>
              </div>
              <label>
                Note (optional)
                <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Room, link or agenda" />
              </label>
              {formError && <div className="hc-error" role="alert">{formError}</div>}
              <div className="leave-form-actions">
                <button type="button" className="button secondary" onClick={() => setDrawerOpen(false)}>Cancel</button>
                <button type="button" className="button primary" onClick={saveEvent}>
                  <CalendarDays size={16} />
                  Save event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}