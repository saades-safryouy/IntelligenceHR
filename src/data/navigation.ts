import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  LogOut,
  CalendarDays,
  FolderOpen,
  BarChart3,
  Settings,
  BriefcaseBusiness,
  Building2,
  Clock3,
  GraduationCap,
  WalletCards,
  Workflow,
  Network,
} from 'lucide-react'

export type NavSectionId =
  | 'overview'
  | 'people'
  | 'talent'
  | 'timeLeave'
  | 'operations'
  | 'payroll'
  | 'intelligence'
  | 'system'

export type NavItem = {
  to: string
  label: string
  searchLabel?: string
  icon: typeof LayoutDashboard
  badge?: string
  permissions?: string[]
  section: NavSectionId
}

/**
 * Sidebar sections, in display order. `headerKey` is resolved with
 * `text()` (I18nContext) so the header is translated in EN/FR/AR.
 * The first section ('overview') renders no header: the WORKSPACE label
 * above the nav already labels it.
 */
export const navSections: Array<{ id: NavSectionId; headerKey: string }> = [
  { id: 'overview', headerKey: 'NAV_SECTION_OVERVIEW' },
  { id: 'people', headerKey: 'NAV_SECTION_PEOPLE' },
  { id: 'talent', headerKey: 'NAV_SECTION_TALENT' },
  { id: 'timeLeave', headerKey: 'NAV_SECTION_TIME_LEAVE' },
  { id: 'operations', headerKey: 'NAV_SECTION_OPERATIONS' },
  { id: 'payroll', headerKey: 'NAV_SECTION_PAYROLL' },
  { id: 'intelligence', headerKey: 'NAV_SECTION_INTELLIGENCE' },
  { id: 'system', headerKey: 'NAV_SECTION_SYSTEM' },
]

export const navItems: NavItem[] = [
  {
    to: '/app/dashboard',
    label: 'dashboard',
    icon: LayoutDashboard,
    section: 'overview',
  },
  {
    to: '/app/employees',
    label: 'people',
    icon: Users,
    section: 'people',
  },
  {
    to: '/app/departments',
    label: 'departments',
    icon: Building2,
    section: 'people',
  },
  {
    to: '/app/organigramme',
    label: 'organigramme',
    icon: Network,
    permissions: ['organigram.view', 'people.employee.view.all', 'people.employee.view.department', 'people.employee.self.view'],
    section: 'people',
  },
  {
    to: '/app/recruitment',
    label: 'recruitment',
    icon: BriefcaseBusiness,
    section: 'talent',
  },
  {
    to: '/app/onboarding/requests',
    label: 'onboarding',
    icon: ClipboardCheck,
    section: 'talent',
  },
  {
    to: '/app/offboarding/requests',
    label: 'offboarding',
    icon: LogOut,
    section: 'talent',
  },
  {
    to: '/app/training',
    label: 'training',
    icon: GraduationCap,
    section: 'talent',
  },
  {
    to: '/app/performance',
    label: 'performance',
    icon: BarChart3,
    section: 'talent',
  },
  {
    to: '/app/leave/requests',
    label: 'leave',
    icon: CalendarDays,
    section: 'timeLeave',
  },
  {
    to: '/app/holidays',
    label: 'holidays',
    icon: CalendarDays,
    section: 'timeLeave',
  },
  {
    to: '/app/calendar',
    label: 'calendar',
    icon: CalendarDays,
    section: 'timeLeave',
  },
  {
    to: '/app/attendance',
    label: 'attendance',
    icon: Clock3,
    section: 'timeLeave',
  },
  {
    to: '/app/workflows',
    label: 'workflows',
    icon: Workflow,
    section: 'operations',
  },
  {
    to: '/app/documents',
    label: 'documents',
    icon: FolderOpen,
    section: 'operations',
  },
  {
    to: '/app/payroll',
    label: 'payroll',
    icon: WalletCards,
    permissions: ['payroll.run.view'],
    section: 'payroll',
  },
  {
    to: '/app/intelligence/ask',
    label: 'askIntelligence',
    icon: BriefcaseBusiness,
    badge: 'AI',
    section: 'intelligence',
  },
  {
    to: '/app/automations',
    label: 'automations',
    icon: Clock3,
    section: 'intelligence',
  },
  {
    to: '/app/reports',
    label: 'reports',
    icon: BarChart3,
    section: 'intelligence',
  },
  {
    to: '/app/settings',
    label: 'settings',
    icon: Settings,
    section: 'system',
  }

]

export const futureModules: Array<{ path: string; title: string; detail: string; icon: typeof LayoutDashboard }> = []
