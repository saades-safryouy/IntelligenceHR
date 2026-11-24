import { ArrowDown, ArrowUp, Check } from 'lucide-react'
import { translations, useI18n } from '../../contexts/I18nContext'
import type { calculateDashboardMetrics } from './DashboardUtils'

type Metrics = ReturnType<typeof calculateDashboardMetrics>
type DeltaTone = 'good' | 'bad' | 'neutral'

type Kpi = {
  label: string
  value: string
  delta: { tone: DeltaTone; icon: 'up' | 'down' | 'check'; text: string }
  desc: string
}

const deltaIcon = (icon: Kpi['delta']['icon']) =>
  icon === 'up' ? <ArrowUp size={13} /> : icon === 'down' ? <ArrowDown size={13} /> : <Check size={13} />

/**
 * The reference KPI strip: one bordered row of exactly four cells with
 * vertical dividers. Each cell: small uppercase label, big bold value, a
 * coloured delta line (green = fine, red = needs attention) and a one-line
 * description. All numbers come from the live dashboard metrics.
 */
export function KpiStrip({ metrics }: { metrics: Metrics }) {
  const { language } = useI18n()
  const t = translations[language]

  const kpis: Kpi[] = [
    {
      label: t.employees,
      value: String(metrics.totalEmployees),
      delta: { tone: 'good', icon: 'up', text: `${metrics.activeEmployees} ${t.kpiActive}` },
      desc: t.kpiEmployeesNote,
    },
    {
      label: t.kpiLeavePending,
      value: String(metrics.leavePending),
      delta: {
        tone: metrics.leavePending > 0 ? 'bad' : 'good',
        icon: 'down',
        text: `${metrics.onLeaveCount} ${t.kpiOnLeaveNow}`,
      },
      desc: t.kpiLeavePendingNote,
    },
    {
      label: t.activeOnboarding,
      value: String(metrics.activeOnboarding),
      delta:
        metrics.onboardingAtRisk > 0
          ? { tone: 'bad', icon: 'down', text: `${metrics.onboardingAtRisk} ${t.kpiAtRisk}` }
          : { tone: 'good', icon: 'check', text: t.kpiOnTrack },
      desc: t.kpiOnboardingNote,
    },
    {
      label: t.activeOffboarding,
      value: String(metrics.activeOffboarding),
      delta:
        metrics.offboardingOverdue > 0
          ? { tone: 'bad', icon: 'down', text: `${metrics.offboardingOverdue} ${t.kpiOverdue}` }
          : { tone: 'good', icon: 'check', text: t.kpiOnTrack },
      desc: t.kpiOffboardingNote,
    },
  ]

  return (
    <section className="ref-kpi-strip" aria-label="Key indicators">
      {kpis.map((kpi) => (
        <div className="ref-kpi" key={kpi.label}>
          <span className="ref-kpi-label">{kpi.label}</span>
          <strong className="ref-kpi-value">{kpi.value}</strong>
          <span className={`ref-kpi-delta ${kpi.delta.tone}`}>
            {deltaIcon(kpi.delta.icon)}
            {kpi.delta.text}
          </span>
          <p className="ref-kpi-desc">{kpi.desc}</p>
        </div>
      ))}
    </section>
  )
}
