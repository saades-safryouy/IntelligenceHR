import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import { getHolidays, resolveEmployee } from '../../data/employeeStore'
import { apiEmployeeRepository } from '../../data/apiEmployeeRepository'
import { apiData, isApiDataMode } from '../../lib/apiClient'
import type { Employee, Holiday } from '../../types/models'
import { daysUntil, formatDate } from '../../utils/dates'
import { holidayAppliesToEmployee, holidaysForYear, uniqueYears } from '../../utils/holidays'
import { employeeDashboardTranslations } from './translations'
import { EmptyState } from './components'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'

interface ApiHoliday {
  id: string
  name: string
  name_key: string | null
  date: string
  days: number
  recurring: boolean
  type: Holiday['type']
  country: string | null
  site: string | null
}

export function EmployeeHolidaysPage() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const t = employeeDashboardTranslations[language]
  const [year, setYear] = useState(new Date().getFullYear())
  const [employee, setEmployee] = useState<Employee | undefined>(() => isApiDataMode ? undefined : resolveEmployee(currentUser))
  const [holidays, setHolidays] = useState<Holiday[]>(() => isApiDataMode ? [] : getHolidays())
  const [country, setCountry] = useState('')
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!isApiDataMode) return
    const employeeId = currentUser?.employeeId
    if (!employeeId) {
      setLoading(false)
      setError(t.notFound)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      apiEmployeeRepository.get(employeeId),
      apiData<ApiHoliday[]>(`/api/v1/holidays?year=${year}`),
    ])
      .then(([record, rows]) => {
        if (!active) return
        if (!record) throw new Error(t.notFound)
        setEmployee(record)
        setCountry((current) => current || record.country)
        setHolidays(rows.map((item) => ({
          id: item.id,
          name: item.name,
          nameKey: item.name_key ?? undefined,
          date: item.date,
          days: item.days,
          recurring: item.recurring,
          type: item.type,
          country: item.country,
          site: item.site,
        })))
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : t.loadFailed) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [currentUser?.employeeId, reload, t.loadFailed, t.notFound, year])

  const years = useMemo(
    () => isApiDataMode ? [year - 1, year, year + 1] : uniqueYears(holidays),
    [holidays, year],
  )
  const countries = Array.from(
    new Set(holidays.map((holiday) => holiday.country).filter(Boolean) as string[]),
  )
  const visible = holidaysForYear(holidays, year)
    .filter((holiday) => {
      if (country && holiday.country && holiday.country !== country) return false
      if (employee && !country) return holidayAppliesToEmployee(holiday, employee) || !holiday.country
      return true
    })
    .map((holiday) => ({ ...holiday, inDays: daysUntil(holiday.date) }))
    .sort((a, b) => a.inDays - b.inDays)

  return (
    <div className="page employee-page">
      <PageHeader eyebrow={t.employeePortal} title={t.holidaysTitle} subtitle={t.holidaysSubtitle}>
        <label className="filter-control">
          {t.year}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t.year}>
            {years.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        {countries.length > 0 && (
          <label className="filter-control">
            {t.location}
            <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label={t.location}>
              <option value="">{t.allCountries}</option>
              {countries.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
      </PageHeader>

      {loading && <div className="empty-block" role="status">{t.loading}</div>}
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}
      {error && <button className="button secondary" onClick={() => setReload((value) => value + 1)}>{t.tryAgain}</button>}
      <section className="panel">
        {loading ? null : visible.length ? (
          <ul className="holiday-board">
            {visible.map((holiday) => (
              <li key={`${holiday.id}-${holiday.date}`} className={holiday.type === 'Public' ? 'holiday-public' : 'holiday-company'}>
                <time>{formatDate(holiday.date, language)}</time>
                <div>
                  <strong>{t[holiday.nameKey as keyof typeof t] || holiday.name}</strong>
                  <span>
                    {holiday.type === 'Public' ? t.publicHoliday : t.companyHoliday}
                    {holiday.recurring ? ` · ${t.recurring}` : ''}
                    {holiday.country ? ` · ${holiday.country}` : ''}
                    {holiday.site ? ` · ${holiday.site}` : ''}
                  </span>
                </div>
                <em>
                  {holiday.days} {holiday.days === 1 ? t.day : t.days}
                  {holiday.inDays >= 0 ? ` · ${holiday.inDays} ${t.daysAway}` : ''}
                </em>
              </li>
            ))}
          </ul>
        ) : error ? null : (
          <EmptyState title={t.noUpcomingHolidays} />
        )}
      </section>
    </div>
  )
}
