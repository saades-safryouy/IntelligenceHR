import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Sun,
  Search,
  Calendar,
  Sparkles,
  Info,
  CalendarDays,
  Globe2,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import { listVisibleHolidays } from '../../data/managerDashboardRepository'
import type { Holiday } from '../../types/models'
import { managerTranslations } from './translations'
import { ManagerApiNotice } from './ManagerDashboardPage'
import './ManagerDashboard.css'

export function ManagerHolidaysPage() {
  const { language } = useI18n()
  const copy = managerTranslations[language]

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const loadHolidays = useCallback(
    async (year: number) => {
      if (!isApiDataMode) return
      setLoading(true)
      setError('')
      try {
        const data = await listVisibleHolidays(year)
        setHolidays(data)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : copy.loadError)
      } finally {
        setLoading(false)
      }
    },
    [copy.loadError],
  )

  useEffect(() => {
    void loadHolidays(selectedYear)
  }, [loadHolidays, selectedYear])

  const filteredHolidays = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return holidays
      .filter((h) => {
        if (!term) return true
        return (
          h.name.toLowerCase().includes(term) ||
          (h.type && h.type.toLowerCase().includes(term)) ||
          (h.country && h.country.toLowerCase().includes(term))
        )
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [holidays, searchTerm])

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const nextUpcoming = useMemo(() => {
    return holidays.find((h) => h.date >= todayStr)
  }, [holidays, todayStr])

  const publicCount = useMemo(() => {
    return holidays.filter((h) => h.type === 'Public' || !h.type).length
  }, [holidays])

  if (!isApiDataMode) return <ManagerApiNotice message={copy.apiRequired} />

  return (
    <div className="page manager-page">
      <Breadcrumb
        items={[
          { label: copy.portal, path: '/manager/dashboard' },
          { label: copy.holidays },
        ]}
      />

      <PageHeader
        eyebrow={copy.portal}
        title={copy.holidaysManagement}
        subtitle={copy.holidaysManagementSubtitle}
      />

      <div className="manager-notice-banner">
        <Info size={16} aria-hidden="true" />
        <span>{copy.readOnlyNotice}</span>
      </div>

      <div className="manager-kpi-grid">
        <div className="manager-kpi-card">
          <div className="manager-kpi-icon blue" aria-hidden="true">
            <Sun size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">
              {copy.year} {selectedYear}
            </span>
            <strong className="manager-kpi-value">{holidays.length}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon orange" aria-hidden="true">
            <Calendar size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.publicHoliday}</span>
            <strong className="manager-kpi-value">{publicCount}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon mint" aria-hidden="true">
            <Sparkles size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.today}</span>
            <strong className="manager-kpi-value" title={nextUpcoming?.name}>
              {nextUpcoming ? nextUpcoming.name : '—'}
            </strong>
          </div>
        </div>
      </div>

      <section className="manager-section">
        <div className="manager-filter-bar">
          <div className="manager-search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label={copy.searchTeam}
              placeholder={copy.searchTeam}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="manager-status-pills" role="group" aria-label={copy.year}>
            {[currentYear - 1, currentYear, currentYear + 1].map((yr) => (
              <button
                key={yr}
                type="button"
                aria-pressed={selectedYear === yr}
                className={`manager-filter-pill ${selectedYear === yr ? 'active' : ''}`}
                onClick={() => setSelectedYear(yr)}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="manager-loading-state" role="status">{copy.loading}</div>
        ) : error ? (
          <div className="manager-error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadHolidays(selectedYear)}>
              {copy.retry}
            </button>
          </div>
        ) : filteredHolidays.length === 0 ? (
          <div className="manager-empty-state">
            <Sun size={32} aria-hidden="true" />
            <p>{copy.noHolidays}</p>
          </div>
        ) : (
          <div className="manager-table-wrapper">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>{copy.from}</th>
                  <th>{copy.request}</th>
                  <th>{copy.duration}</th>
                  <th>{copy.module}</th>
                  <th>{copy.status}</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolidays.map((h) => {
                  const isFuture = h.date >= todayStr
                  return (
                    <tr key={h.id}>
                      <td>
                        <div className="manager-cell-dates">
                          <CalendarDays size={14} aria-hidden="true" />
                          <strong>{h.date}</strong>
                        </div>
                      </td>
                      <td>
                        <strong>{h.name}</strong>
                        {h.country && (
                          <small className="manager-card-sub">
                            <Globe2 size={12} className="manager-inline-icon" aria-hidden="true" />
                            {h.country}
                          </small>
                        )}
                      </td>
                      <td>
                        {h.days} {copy.days}
                      </td>
                      <td>
                        <span className="manager-type-badge">{h.type || 'Public'}</span>
                      </td>
                      <td>
                        <div className="manager-badge-stack">
                          <span className={`manager-status-badge ${isFuture ? 'info' : 'quiet'}`}>
                            {isFuture ? copy.today : copy.completed}
                          </span>
                          {h.recurring && (
                            <span className="manager-tag-badge">{copy.recurring}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}