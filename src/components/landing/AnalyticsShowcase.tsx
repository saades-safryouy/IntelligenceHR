import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CalendarOff,
  Clock,
  Smile,
  Timer,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import {
  analyticsData,
  contractMix,
  deptColors,
  RANGE_MONTHS,
  tenureBuckets,
  TIME_RANGES,
  type ContractKey,
  type TimeRange,
} from "./landingData";
import { ChartTooltip } from "./HeroDashboardPreview";
import { Counter, Reveal, Section, SectionHeading, cx, useLanding } from "./LandingPrimitives";

const axis = { fontSize: 11, fill: "var(--ihr-muted)" };

/**
 * Labels for the new charts. If `t.analytics` already has a key with the same
 * name it is used, otherwise the English fallback below. Add these keys to
 * landingTranslations to translate them.
 */
const EXTRA_LABELS = {
  turnover: "Turnover rate",
  timeToHire: "Avg. time to hire",
  engagement: "Engagement score",
  avgTenure: "Avg. tenure",
  daysUnit: "days",
  yearsUnit: "yrs",
  hiresVsExits: "Hires vs. exits",
  hires: "Hires",
  exits: "Exits",
  engagementTrend: "Engagement trend",
  funnel: "Recruitment funnel",
  applicants: "Applicants",
  screened: "Screened",
  interviewed: "Interviewed",
  offers: "Offers",
  hired: "Hired",
  tenureDist: "Tenure distribution (years)",
  contractMix: "Workforce by contract type",
  fullTime: "Full-time",
  partTime: "Part-time",
  contractor: "Contractors",
  intern: "Interns",
} as const;
type ExtraKey = keyof typeof EXTRA_LABELS;

const contractColors: Record<ContractKey, string> = {
  fullTime: "var(--ihr-primary)",
  partTime: "var(--ihr-cyan)",
  contractor: "var(--ihr-violet)",
  intern: "var(--ihr-warning)",
};

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col rounded-3xl p-5 ihr-card", className)}>
      <h3 className="text-sm font-semibold text-ihr-fg">{title}</h3>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

function ChartLegend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-ihr-muted">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Whole numbers animate with Counter; decimals are shown as-is. */
function KpiValue({ value, suffix }: { value: number; suffix?: string }) {
  const valueClass = "text-2xl font-extrabold tracking-tight text-ihr-fg sm:text-3xl";
  return (
    <div className="flex items-baseline gap-1.5">
      {Number.isInteger(value) ? (
        <Counter value={value} className={valueClass} />
      ) : (
        <span className={cx(valueClass, "tabular-nums")}>{value.toFixed(1)}</span>
      )}
      {suffix && <span className="text-xs font-semibold text-ihr-muted">{suffix}</span>}
    </div>
  );
}

export function AnalyticsShowcase() {
  const { t } = useLanding();
  const [range, setRange] = useState<TimeRange>("1Y");
  const [hoverDept, setHoverDept] = useState<number | null>(null);
  const data = analyticsData[range];
  const deptTotal = data.departments.reduce((a, b) => a + b.value, 0);
  const ob = data.onboarding;
  const obTotal = ob.completed + ob.inProgress + ob.notStarted;
  const obPct = Math.round((ob.completed / obTotal) * 100);

  const extra = t.analytics as unknown as Partial<Record<ExtraKey, string>>;
  const x = (key: ExtraKey) => extra[key] ?? EXTRA_LABELS[key];

  // Derived analytics
  const exitsTotal = data.growth.reduce((a, g) => a + g.exits, 0);
  const avgHeadcount = data.growth.reduce((a, g) => a + g.headcount, 0) / data.growth.length;
  const turnover = Math.round((exitsTotal / avgHeadcount) * (12 / RANGE_MONTHS[range]) * 100);
  const engagementNow = data.growth[data.growth.length - 1].engagement;
  const tenureTotal = tenureBuckets.reduce((a, b) => a + b.value, 0);
  const avgTenure = tenureBuckets.reduce((a, b) => a + b.value * b.mid, 0) / tenureTotal;
  const contractTotal = contractMix.reduce((a, c) => a + c.value, 0);

  const flowData = data.growth.map((g) => ({ label: g.label, hires: g.hires, exits: -g.exits }));
  const funnelSteps = [
    { key: "applicants", label: x("applicants"), value: data.funnel.applicants },
    { key: "screened", label: x("screened"), value: data.funnel.screened },
    { key: "interviewed", label: x("interviewed"), value: data.funnel.interviewed },
    { key: "offers", label: x("offers"), value: data.funnel.offers },
    { key: "hired", label: x("hired"), value: data.funnel.hired },
  ];
  const funnelTop = funnelSteps[0].value;

  const kpis = [
    { label: t.analytics.total, value: data.status.total, icon: Users, tone: "text-ihr-primary bg-ihr-primary/10" },
    { label: t.analytics.active, value: data.status.active, icon: UserCheck, tone: "text-ihr-success bg-ihr-success/10" },
    { label: t.analytics.onLeave, value: data.status.onLeave, icon: CalendarOff, tone: "text-ihr-warning bg-ihr-warning/10" },
    { label: t.analytics.newHires, value: data.status.newHires, icon: UserPlus, tone: "text-ihr-violet bg-ihr-violet/10" },
  ];

  const insightKpis = [
    { label: x("turnover"), value: turnover, suffix: "%", icon: UserMinus, tone: "text-ihr-warning bg-ihr-warning/10" },
    { label: x("timeToHire"), value: data.timeToHire, suffix: x("daysUnit"), icon: Timer, tone: "text-ihr-cyan bg-ihr-cyan/10" },
    { label: x("engagement"), value: engagementNow, suffix: "/100", icon: Smile, tone: "text-ihr-success bg-ihr-success/10" },
    { label: x("avgTenure"), value: Number(avgTenure.toFixed(1)), suffix: x("yearsUnit"), icon: Clock, tone: "text-ihr-violet bg-ihr-violet/10" },
  ];

  return (
    <Section id="analytics" className="bg-ihr-bg-soft">
      <SectionHeading
        eyebrow={t.analytics.eyebrow}
        lines={[t.analytics.title1, t.analytics.title2, t.analytics.title3]}
        desc={t.analytics.desc}
      />
      <Reveal className="mt-14">
        <div className="rounded-[2rem] p-3 sm:p-5 ihr-glass">
          <div className="flex flex-col gap-3 px-1 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ihr-fg">
              <Activity className="size-4 text-ihr-primary" />
              {t.analytics.demo}
            </span>
            <div role="tablist" aria-label="Time range" className="inline-flex self-start rounded-full bg-ihr-card-2 p-1">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  role="tab"
                  type="button"
                  aria-selected={range === r}
                  onClick={() => setRange(r)}
                  className={cx(
                    "relative rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors sm:px-4",
                    range === r ? "text-ihr-on-primary" : "text-ihr-muted hover:text-ihr-fg",
                  )}
                >
                  {range === r && <motion.span layoutId="ihr-range" className="absolute inset-0 -z-0 rounded-full ihr-btn-primary" />}
                  <span className="relative">{r}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl p-4 ihr-card">
                <span className={cx("grid size-9 place-items-center rounded-xl", k.tone)}>
                  <k.icon className="size-4" />
                </span>
                <p className="mt-3 truncate text-xs text-ihr-muted">{k.label}</p>
                <Counter value={k.value} className="text-2xl font-extrabold tracking-tight text-ihr-fg sm:text-3xl" />
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {insightKpis.map((k) => (
              <div key={k.label} className="rounded-2xl p-4 ihr-card">
                <span className={cx("grid size-9 place-items-center rounded-xl", k.tone)}>
                  <k.icon className="size-4" />
                </span>
                <p className="mt-3 truncate text-xs text-ihr-muted">{k.label}</p>
                <KpiValue value={k.value} suffix={k.suffix} />
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Panel title={t.analytics.growth} className="lg:col-span-2">
              <div className="h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.growth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ihr-growth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ihr-primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--ihr-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--ihr-border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} domain={["dataMin - 20", "dataMax + 10"]} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ihr-primary)", strokeDasharray: 4 }} />
                    <Area
                      type="monotone"
                      dataKey="headcount"
                      name={t.analytics.total}
                      stroke="var(--ihr-primary)"
                      strokeWidth={2.5}
                      fill="url(#ihr-growth)"
                      activeDot={{ r: 6, fill: "var(--ihr-primary)", stroke: "var(--ihr-card)", strokeWidth: 3 }}
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title={t.analytics.dept}>
              <div className="relative mx-auto h-44 w-44" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.departments}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={3}
                      stroke="none"
                      onMouseEnter={(_, i) => setHoverDept(i)}
                      onMouseLeave={() => setHoverDept(null)}
                      animationDuration={900}
                    >
                      {data.departments.map((d, i) => (
                        <Cell key={d.key} fill={deptColors[d.key]} opacity={hoverDept === null || hoverDept === i ? 1 : 0.3} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-2xl font-extrabold text-ihr-fg tabular-nums">
                      {hoverDept === null ? deptTotal : data.departments[hoverDept].value}
                    </p>
                    <p className="text-[11px] text-ihr-muted">{t.analytics.employees}</p>
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-1">
                {data.departments.map((d, i) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoverDept(i)}
                      onMouseLeave={() => setHoverDept(null)}
                      onFocus={() => setHoverDept(i)}
                      onBlur={() => setHoverDept(null)}
                      className={cx(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors",
                        hoverDept === i ? "bg-ihr-card-2 text-ihr-fg" : "text-ihr-muted",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: deptColors[d.key] }} />
                        <span className="truncate">{t.depts[d.key]}</span>
                      </span>
                      <span className="font-semibold text-ihr-fg tabular-nums">{Math.round((d.value / deptTotal) * 100)}%</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={t.analytics.leave} className="lg:col-span-2">
              <div className="h-60" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.leave} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--ihr-border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--ihr-card-2)" }} />
                    <Bar dataKey="annual" name={t.analytics.annual} stackId="a" fill="var(--ihr-primary)" animationDuration={800} />
                    <Bar dataKey="sick" name={t.analytics.sick} stackId="a" fill="var(--ihr-cyan)" animationDuration={800} />
                    <Bar dataKey="other" name={t.analytics.other} stackId="a" fill="var(--ihr-violet)" radius={[6, 6, 0, 0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartLegend
                items={[
                  [t.analytics.annual, "var(--ihr-primary)"],
                  [t.analytics.sick, "var(--ihr-cyan)"],
                  [t.analytics.other, "var(--ihr-violet)"],
                ]}
              />
            </Panel>

            <Panel title={t.analytics.onboarding}>
              <div className="flex items-center gap-5">
                <div className="relative size-28 shrink-0">
                  <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--ihr-card-2)" strokeWidth="10" />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--ihr-primary)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: obPct / 100 }}
                      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={obPct}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="text-2xl font-extrabold text-ihr-fg"
                      >
                        {obPct}%
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-3">
                  {[
                    [t.analytics.completed, ob.completed, "bg-ihr-primary"],
                    [t.analytics.inProgress, ob.inProgress, "bg-ihr-cyan"],
                    [t.analytics.notStarted, ob.notStarted, "bg-ihr-border"],
                  ].map(([l, v, c]) => (
                    <li key={l as string}>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="truncate text-ihr-muted">{l}</span>
                        <span className="font-semibold text-ihr-fg tabular-nums">{v}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ihr-card-2">
                        <motion.div
                          className={cx("h-full rounded-full", c as string)}
                          animate={{ width: `${((v as number) / obTotal) * 100}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>

            {/* Hires vs. exits */}
            <Panel title={x("hiresVsExits")} className="lg:col-span-2">
              <div className="h-60" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flowData} stackOffset="sign" margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--ihr-border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--ihr-card-2)" }} />
                    <ReferenceLine y={0} stroke="var(--ihr-border)" />
                    <Bar dataKey="hires" name={x("hires")} stackId="flow" fill="var(--ihr-success)" radius={[6, 6, 0, 0]} animationDuration={800} />
                    <Bar dataKey="exits" name={x("exits")} stackId="flow" fill="var(--ihr-warning)" radius={[0, 0, 6, 6]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ChartLegend
                items={[
                  [x("hires"), "var(--ihr-success)"],
                  [x("exits"), "var(--ihr-warning)"],
                ]}
              />
            </Panel>

            {/* Engagement trend */}
            <Panel title={x("engagementTrend")}>
              <div className="h-60" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.growth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ihr-engagement" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ihr-success)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--ihr-success)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--ihr-border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} domain={["dataMin - 4", 100]} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ihr-success)", strokeDasharray: 4 }} />
                    <Area
                      type="monotone"
                      dataKey="engagement"
                      name={x("engagement")}
                      stroke="var(--ihr-success)"
                      strokeWidth={2.5}
                      fill="url(#ihr-engagement)"
                      activeDot={{ r: 6, fill: "var(--ihr-success)", stroke: "var(--ihr-card)", strokeWidth: 3 }}
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            {/* Recruitment funnel */}
            <Panel title={x("funnel")} className="lg:col-span-2">
              <ul className="space-y-3">
                {funnelSteps.map((step, i) => {
                  const conversion =
                    i === 0 ? null : Math.round((step.value / funnelSteps[i - 1].value) * 100);
                  return (
                    <li key={step.key}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate text-ihr-muted">{step.label}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-semibold text-ihr-fg tabular-nums">{step.value.toLocaleString()}</span>
                          {conversion !== null && (
                            <span className="w-9 text-end text-[11px] text-ihr-muted tabular-nums">{conversion}%</span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ihr-card-2" dir="ltr">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: "var(--ihr-primary)", opacity: 1 - i * 0.14 }}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max((step.value / funnelTop) * 100, 2)}%` }}
                          transition={{ duration: 0.8, delay: i * 0.05 }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {/* Tenure distribution */}
            <Panel title={x("tenureDist")}>
              <div className="h-52" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenureBuckets} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--ihr-border)" vertical={false} />
                    <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--ihr-card-2)" }} />
                    <Bar
                      dataKey="value"
                      name={t.analytics.employees}
                      fill="var(--ihr-violet)"
                      radius={[6, 6, 0, 0]}
                      animationDuration={800}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            {/* Contract mix */}
            <Panel title={x("contractMix")} className="lg:col-span-3">
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-ihr-card-2" dir="ltr">
                {contractMix.map((c, i) => (
                  <motion.div
                    key={c.key}
                    className="h-full first:rounded-s-full last:rounded-e-full"
                    style={{ background: contractColors[c.key] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.value / contractTotal) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06 }}
                  />
                ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {contractMix.map((c) => (
                  <li key={c.key} className="rounded-2xl p-3 ihr-card">
                    <span className="flex items-center gap-2 text-xs text-ihr-muted">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: contractColors[c.key] }} />
                      <span className="truncate">{x(c.key)}</span>
                    </span>
                    <p className="mt-1.5 text-xl font-extrabold text-ihr-fg tabular-nums">
                      {c.value}
                      <span className="ms-1.5 text-xs font-semibold text-ihr-muted">
                        {Math.round((c.value / contractTotal) * 100)}%
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export default AnalyticsShowcase;