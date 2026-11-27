import { Fragment, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  BarChart3,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/authHooks'
import type { Language, Theme } from '../../contexts/I18nContext'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode, apiRequest } from '../../lib/apiClient'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { NotificationPanel } from '../notifications/NotificationPanel'
import { managerTranslations } from '../../pages/manager/translations'
import { GlobalSearch } from './GlobalSearch'

interface UnreadNotifications {
  total: number
}

export function ManagerLayout({
  language,
  theme,
  onThemeChange,
  onLanguageChange,
  onLogout,
}: {
  language: Language
  theme: Theme
  onThemeChange: (theme: Theme) => void
  onLanguageChange: (language: Language) => void
  onLogout: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [unread, setUnread] = useState(0)
  const { currentUser, hasPermission } = useAuth()
  const navigate = useNavigate()
  const copy = managerTranslations[language]
  const { text } = useI18n()
  const canViewTeam = hasPermission('people.employee.view.all') || hasPermission('people.employee.view.department')
  const canViewNotifications = hasPermission('notification.view')
  const canApprove = hasPermission('workflow.approve')
  const canViewWorkflows =
    hasPermission('workflow.instance.view') ||
    hasPermission('workflow.instance.view.all') ||
    canApprove

  useEffect(() => {
    if (!isApiDataMode || !canViewNotifications) return
    let active = true
    apiRequest<UnreadNotifications>('/api/v1/notifications?unread=1&pageSize=1')
      .then((response) => { if (active) setUnread(response.total) })
      .catch((cause: unknown) => { console.error('Failed to load manager notification count:', cause) })
    return () => { active = false }
  }, [canViewNotifications])

  // Sidebar sections, in display order. The first section ('overview') renders
  // no header: the manager-portal label above the nav already labels it.
  // Sections with no visible link (permission-gated) render nothing.
  const navSections = [
    { id: 'overview', headerKey: 'NAV_SECTION_OVERVIEW' },
    { id: 'team', headerKey: 'NAV_SECTION_TEAM' },
    { id: 'timeLeave', headerKey: 'NAV_SECTION_TIME_LEAVE' },
    { id: 'lifecycle', headerKey: 'NAV_SECTION_LIFECYCLE' },
    { id: 'approvals', headerKey: 'NAV_SECTION_APPROVALS' },
    { id: 'notifications', headerKey: 'NAV_SECTION_NOTIFICATIONS' },
  ] as const

  type ManagerNavSection = (typeof navSections)[number]['id']

  const navigation: Array<{
    to: string
    label: string
    icon: typeof LayoutDashboard
    badge?: number
    section: ManagerNavSection
  }> = [
    { to: '/manager/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'overview' },
    ...(canViewTeam ? [{ to: '/manager/analytics', label: 'Reports', icon: BarChart3, section: 'team' as const }] : []),
    ...(canViewTeam ? [{ to: '/manager/team', label: 'People', icon: Network, section: 'team' as const }] : []),
    ...(canViewTeam ? [{ to: '/manager/leave', label: 'Leave', icon: CalendarDays, section: 'timeLeave' as const }] : []),
    { to: '/manager/holidays', label: 'Holidays', icon: Sun, section: 'timeLeave' },
    ...(canViewTeam ? [{ to: '/manager/onboarding', label: 'Onboarding', icon: UserPlus, section: 'lifecycle' as const }] : []),
    ...(canViewTeam ? [{ to: '/manager/offboarding', label: 'Offboarding', icon: UserMinus, section: 'lifecycle' as const }] : []),
    ...(canApprove ? [{ to: '/manager/approvals', label: 'Approvals', icon: ClipboardCheck, section: 'approvals' as const }] : []),
    ...(canViewWorkflows ? [{ to: '/manager/workflows', label: 'Workflows', icon: GitBranch, section: 'approvals' as const }] : []),
    ...(canViewNotifications
      ? [
          {
            to: '/manager/notifications',
            label: 'Notifications',
            icon: Bell,
            badge: unread > 0 ? unread : undefined,
            section: 'notifications' as const,
          },
        ]
      : []),
  ]

  return (
    <div className="app-frame">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand-wrap">
          <Brand compact={collapsed} theme={theme} />
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">{copy.portal}</div>
        <nav>
          {navSections.map(({ id, headerKey }) => {
            const items = navigation.filter((item) => item.section === id)
            if (items.length === 0) return null
            return (
              <Fragment key={id}>
                {id !== 'overview' ? <div className="workspace-label">{text(headerKey)}</div> : null}
                {items.map(({ to, label, icon: Icon, badge }) => (
                  <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}>
                    <Icon size={18} />
                    <span>{label}</span>
                    {badge !== undefined && <span className="nav-badge">{badge}</span>}
                  </NavLink>
                ))}
              </Fragment>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><CircleHelp size={18} /><span>{copy.help}</span></div>
          <div className="mini-user">
            <div className="avatar">{currentUser?.initials ?? '??'}</div>
            {!collapsed && <div><strong>{currentUser?.name ?? '—'}</strong><span>{currentUser?.title ?? copy.portal}</span></div>}
            <MoreHorizontal size={16} />
          </div>
          <button className="sidebar-logout" onClick={() => { onLogout(); navigate('/login', { replace: true }) }} aria-label={copy.logout}>
            <LogOut size={17} /><span>{copy.logout}</span>
          </button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <main className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="icon-button collapse-toggle" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="manager-shell-label"><Network size={16} /><span>{copy.portal}</span></div>
          <GlobalSearch
            placeholder="Search people, departments, roles..."
            modules={navigation.map(({ label, to }) => ({ label, to }))}
            employeeTo="/manager/team"
            onNavigate={navigate}
          />
          <div className="top-actions">
            <LanguageSwitch language={language} onChange={onLanguageChange} />
            <button className="theme-toggle" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            {canViewNotifications && (
              <div className="notification-wrap">
                <button className="icon-button notification-button" onClick={() => setShowNotifications((value) => !value)} aria-label="Notifications">
                  <Bell size={19} />{unread > 0 && <i>{unread}</i>}
                </button>
                {showNotifications && <NotificationPanel onUnreadCountChange={setUnread} />}
              </div>
            )}
            <div className="top-user">
              <div className="avatar">{currentUser?.initials ?? '??'}</div>
              <div><strong>{currentUser?.name ?? '—'}</strong><span>{currentUser?.title ?? copy.portal}</span></div>
            </div>
          </div>
        </header>
        <div className="content"><Outlet /></div>
      </main>
    </div>
  )
}
