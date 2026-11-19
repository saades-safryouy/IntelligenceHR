export type DeptKey = "engineering" | "sales" | "hr" | "finance" | "operations";
export type TimeRange = "5Y" | "3Y" | "1Y" | "6M";
export type ContractKey = "fullTime" | "partTime" | "contractor" | "intern";

export const TIME_RANGES: TimeRange[] = ["5Y", "3Y", "1Y", "6M"];

/** Length of each range in months (used to annualize rates). */
export const RANGE_MONTHS: Record<TimeRange, number> = {
  "5Y": 60,
  "3Y": 36,
  "1Y": 12,
  "6M": 6,
};

/** CSS variables used for each department (keeps colors theme-aware). */
export const deptColors: Record<DeptKey, string> = {
  engineering: "var(--ihr-primary)",
  sales: "var(--ihr-cyan)",
  hr: "var(--ihr-violet)",
  finance: "var(--ihr-success)",
  operations: "var(--ihr-warning)",
};

export const NAV_SECTIONS = [
  { id: "home", key: "home" },
  { id: "features", key: "features" },
  { id: "modules", key: "modules" },
  { id: "how-it-works", key: "how" },
  { id: "analytics", key: "analytics" },
  { id: "contact", key: "contact" },
] as const;

/** Last 8 months, ending at the current headcount of 100. */
export const heroGrowth = [
  { m: "Apr", v: 91 },
  { m: "May", v: 93 },
  { m: "Jun", v: 93 },
  { m: "Jul", v: 95 },
  { m: "Aug", v: 96 },
  { m: "Sep", v: 97 },
  { m: "Oct", v: 99 },
  { m: "Nov", v: 100 },
];

export const heroDepartments: { key: DeptKey; value: number }[] = [
  { key: "engineering", value: 33 },
  { key: "sales", value: 23 },
  { key: "operations", value: 19 },
  { key: "finance", value: 13 },
  { key: "hr", value: 12 },
];

/** Today's snapshot: employees by time at the company (years). `mid` is the bucket midpoint. */
export const tenureBuckets = [
  { label: "<1", value: 18, mid: 0.5 },
  { label: "1–2", value: 22, mid: 1.5 },
  { label: "2–3", value: 20, mid: 2.5 },
  { label: "3–5", value: 22, mid: 4 },
  { label: "5+", value: 18, mid: 6 },
];

/** Today's snapshot: employees by contract type (sums to 100). */
export const contractMix: { key: ContractKey; value: number }[] = [
  { key: "fullTime", value: 78 },
  { key: "partTime", value: 8 },
  { key: "contractor", value: 9 },
  { key: "intern", value: 5 },
];

export interface FunnelData {
  applicants: number;
  screened: number;
  interviewed: number;
  offers: number;
  hired: number;
}

/**
 * Sample data for a company of 100 employees.
 * - growth: per step, headcount at the end of the step, hires, exits and the
 *   engagement score (0-100). headcount = previous headcount + hires - exits.
 * - departments: headcount per department (6M is today's split; longer
 *   ranges show the split at the start of the period).
 * - leave: requests submitted per step.
 * - status: total = active + onLeave + newHires (newHires = hires of the
 *   period who are still employed).
 * - onboarding: sums to status.newHires.
 * - funnel: recruitment funnel for the period; funnel.hired = total hires.
 * - timeToHire: average days from application to accepted offer.
 */
interface AnalyticsSet {
  growth: { label: string; headcount: number; hires: number; exits: number; engagement: number }[];
  departments: { key: DeptKey; value: number }[];
  leave: { label: string; annual: number; sick: number; other: number }[];
  status: { total: number; active: number; onLeave: number; newHires: number };
  onboarding: { completed: number; inProgress: number; notStarted: number };
  funnel: FunnelData;
  timeToHire: number;
}

export const analyticsData: Record<TimeRange, AnalyticsSet> = {
  /** Five years, one point per year. */
  "5Y": {
    growth: [
      { label: "2022", headcount: 42, hires: 14, exits: 4, engagement: 66 },
      { label: "2023", headcount: 56, hires: 20, exits: 6, engagement: 70 },
      { label: "2024", headcount: 71, hires: 22, exits: 7, engagement: 74 },
      { label: "2025", headcount: 86, hires: 21, exits: 6, engagement: 77 },
      { label: "2026", headcount: 100, hires: 19, exits: 5, engagement: 80 },
    ],
    departments: [
      { key: "engineering", value: 14 },
      { key: "sales", value: 10 },
      { key: "operations", value: 8 },
      { key: "finance", value: 5 },
      { key: "hr", value: 5 },
    ],
    leave: [
      { label: "2022", annual: 80, sick: 22, other: 9 },
      { label: "2023", annual: 115, sick: 32, other: 13 },
      { label: "2024", annual: 150, sick: 42, other: 17 },
      { label: "2025", annual: 185, sick: 51, other: 21 },
      { label: "2026", annual: 215, sick: 58, other: 25 },
    ],
    status: { total: 100, active: 37, onLeave: 5, newHires: 58 },
    onboarding: { completed: 55, inProgress: 2, notStarted: 1 },
    funnel: { applicants: 2300, screened: 900, interviewed: 380, offers: 140, hired: 96 },
    timeToHire: 36,
  },

  /** Three years, one point per half-year. */
  "3Y": {
    growth: [
      { label: "H1 24", headcount: 63, hires: 11, exits: 4, engagement: 72 },
      { label: "H2 24", headcount: 71, hires: 11, exits: 3, engagement: 74 },
      { label: "H1 25", headcount: 78, hires: 10, exits: 3, engagement: 76 },
      { label: "H2 25", headcount: 86, hires: 11, exits: 3, engagement: 77 },
      { label: "H1 26", headcount: 93, hires: 9, exits: 2, engagement: 79 },
      { label: "H2 26", headcount: 100, hires: 10, exits: 3, engagement: 80 },
    ],
    departments: [
      { key: "engineering", value: 21 },
      { key: "sales", value: 15 },
      { key: "operations", value: 12 },
      { key: "finance", value: 8 },
      { key: "hr", value: 7 },
    ],
    leave: [
      { label: "2024", annual: 150, sick: 42, other: 17 },
      { label: "2025", annual: 185, sick: 51, other: 21 },
      { label: "2026", annual: 215, sick: 58, other: 25 },
    ],
    status: { total: 100, active: 51, onLeave: 5, newHires: 44 },
    onboarding: { completed: 41, inProgress: 2, notStarted: 1 },
    funnel: { applicants: 1400, screened: 560, interviewed: 240, offers: 90, hired: 62 },
    timeToHire: 34,
  },

  /** One year, headcount by month, leave by quarter. */
  "1Y": {
    growth: [
      { label: "Dec", headcount: 86, hires: 1, exits: 0, engagement: 77 },
      { label: "Jan", headcount: 87, hires: 2, exits: 1, engagement: 77 },
      { label: "Feb", headcount: 89, hires: 2, exits: 0, engagement: 78 },
      { label: "Mar", headcount: 90, hires: 1, exits: 0, engagement: 78 },
      { label: "Apr", headcount: 91, hires: 1, exits: 0, engagement: 78 },
      { label: "May", headcount: 93, hires: 2, exits: 0, engagement: 79 },
      { label: "Jun", headcount: 93, hires: 1, exits: 1, engagement: 79 },
      { label: "Jul", headcount: 95, hires: 2, exits: 0, engagement: 79 },
      { label: "Aug", headcount: 96, hires: 2, exits: 1, engagement: 79 },
      { label: "Sep", headcount: 97, hires: 2, exits: 1, engagement: 80 },
      { label: "Oct", headcount: 99, hires: 2, exits: 0, engagement: 80 },
      { label: "Nov", headcount: 100, hires: 2, exits: 1, engagement: 80 },
    ],
    departments: [
      { key: "engineering", value: 28 },
      { key: "sales", value: 20 },
      { key: "operations", value: 17 },
      { key: "finance", value: 11 },
      { key: "hr", value: 10 },
    ],
    leave: [
      { label: "Q4", annual: 48, sick: 15, other: 6 },
      { label: "Q1", annual: 42, sick: 17, other: 5 },
      { label: "Q2", annual: 50, sick: 12, other: 7 },
      { label: "Q3", annual: 70, sick: 14, other: 7 },
    ],
    status: { total: 100, active: 77, onLeave: 5, newHires: 18 },
    onboarding: { completed: 15, inProgress: 2, notStarted: 1 },
    funnel: { applicants: 480, screened: 190, interviewed: 80, offers: 30, hired: 20 },
    timeToHire: 31,
  },

  /** Semester (six months), by month. */
  "6M": {
    growth: [
      { label: "Jun", headcount: 93, hires: 1, exits: 1, engagement: 79 },
      { label: "Jul", headcount: 95, hires: 2, exits: 0, engagement: 79 },
      { label: "Aug", headcount: 96, hires: 2, exits: 1, engagement: 79 },
      { label: "Sep", headcount: 97, hires: 2, exits: 1, engagement: 80 },
      { label: "Oct", headcount: 99, hires: 2, exits: 0, engagement: 80 },
      { label: "Nov", headcount: 100, hires: 2, exits: 1, engagement: 80 },
    ],
    departments: [
      { key: "engineering", value: 33 },
      { key: "sales", value: 23 },
      { key: "operations", value: 19 },
      { key: "finance", value: 13 },
      { key: "hr", value: 12 },
    ],
    leave: [
      { label: "Jun", annual: 16, sick: 5, other: 2 },
      { label: "Jul", annual: 26, sick: 4, other: 3 },
      { label: "Aug", annual: 30, sick: 4, other: 2 },
      { label: "Sep", annual: 14, sick: 6, other: 2 },
      { label: "Oct", annual: 12, sick: 7, other: 3 },
      { label: "Nov", annual: 11, sick: 6, other: 2 },
    ],
    status: { total: 100, active: 84, onLeave: 5, newHires: 11 },
    onboarding: { completed: 8, inProgress: 2, notStarted: 1 },
    funnel: { applicants: 240, screened: 96, interviewed: 42, offers: 16, hired: 11 },
    timeToHire: 28,
  },
};

export type RoleKey =
  | "ceo"
  | "cto"
  | "cso"
  | "chro"
  | "cfo"
  | "engineer"
  | "designer"
  | "account"
  | "recruiter"
  | "analyst";

export interface OrgNode {
  id: string;
  name: string;
  role: RoleKey;
  dept: DeptKey | "executive";
  children?: OrgNode[];
}

export const orgTree: OrgNode = {
  id: "ceo",
  name: "Leila Benali",
  role: "ceo",
  dept: "executive",
  children: [
    {
      id: "cto",
      name: "Karim Haddad",
      role: "cto",
      dept: "engineering",
      children: [
        { id: "e1", name: "Youssef Amrani", role: "engineer", dept: "engineering" },
        { id: "e2", name: "Inès Morel", role: "designer", dept: "engineering" },
        { id: "e3", name: "Omar Tazi", role: "engineer", dept: "engineering" },
      ],
    },
    {
      id: "cso",
      name: "Claire Dubois",
      role: "cso",
      dept: "sales",
      children: [
        { id: "s1", name: "Mehdi Alaoui", role: "account", dept: "sales" },
        { id: "s2", name: "Nora Fassi", role: "account", dept: "sales" },
      ],
    },
    {
      id: "chro",
      name: "Sara Mansouri",
      role: "chro",
      dept: "hr",
      children: [{ id: "h1", name: "Amina Idrissi", role: "recruiter", dept: "hr" }],
    },
    {
      id: "cfo",
      name: "Hugo Laurent",
      role: "cfo",
      dept: "finance",
      children: [{ id: "f1", name: "Rachid Bennis", role: "analyst", dept: "finance" }],
    },
  ],
};

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();