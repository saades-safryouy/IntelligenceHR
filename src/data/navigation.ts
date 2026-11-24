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


export type NavItem = {
  to: string
  label: string
  searchLabel?: string
  icon: typeof LayoutDashboard
  badge?: string
  permissions?: string[]
}

export const navItems: NavItem[] = [
  {
    to: '/app/dashboard',
    label: 'dashboard',
    icon: LayoutDashboard,
  },
  {
    to: '/app/employees',
    label: 'people',
    icon: Users,
  },
  {
    to: '/app/departments',
    label: 'departments',
    icon: Building2,
  },
  {
    to: '/app/organigramme',
    label: 'organigramme',
    icon: Network,
    permissions: ['organigram.view', 'people.employee.view.all', 'people.employee.view.department', 'people.employee.self.view'],
  },
  {
    to: '/app/onboarding/requests',
    label: 'onboarding',
    icon: ClipboardCheck,
  },
  {
    to: '/app/offboarding/requests',
    label: 'offboarding',
    icon: LogOut,
  },
  {
    to: '/app/leave/requests',
    label: 'leave',
    icon: CalendarDays,
  },
  {
    to: '/app/workflows',
    label: 'workflows',
    icon: Workflow,
  },
  {
    to: '/app/holidays',
    label: 'holidays',
    icon: CalendarDays,
  },
  {
    to: '/app/documents',
    label: 'documents',
    icon: FolderOpen,
  },
  {
    to: '/app/calendar',
    label: 'calendar',
    icon: CalendarDays,
  },
  {
    to: '/app/training',
    label: 'training',
    icon: GraduationCap,
  },
  {
    to: '/app/attendance',
    label: 'attendance',
    icon: Clock3,
  },
   {
    to: '/app/intelligence/ask',
    label: 'askIntelligence',
    icon: BriefcaseBusiness,
    badge: 'AI',
  },
  {
    to: '/app/automations',
    label: 'automations',
    icon: Clock3,
  },
  {
    to: '/app/reports',
    label: 'reports',
    icon: BarChart3,
  },
  {
    to: '/app/settings',
    label: 'settings',
    icon: Settings,
  }
 
]

export const futureModules = [
  {
    path: '/app/recruitment',
    title: 'Recruitment',
    detail: 'Connect future hiring workflows directly to onboarding.',
    icon: BriefcaseBusiness,
  },
  {
    path: '/app/performance',
    title: 'Performance',
    detail: 'Build a continuous performance culture with a connected people layer.',
    icon: BarChart3,
  },
  {
    path: '/app/payroll',
    title: 'Payroll & Compensation',
    detail: 'Compensation intelligence will connect to the employee profile.',
    icon: WalletCards,
  },
]
