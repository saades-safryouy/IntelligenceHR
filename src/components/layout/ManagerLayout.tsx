import { useEffect, useState } from 'react'
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
import { isApiDataMode, apiRequest } from '../../lib/apiClient'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { NotificationPanel } from '../notifications/NotificationPanel'
import { managerTranslations } from '../../pages/manager/translations'

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

  const navigation = [
    { to: '/manager/dashboard', label: copy.dashboard, icon: LayoutDashboard },
    ...(canViewTeam ? [{ to: '/manager/analytics', label: 'Analytics', icon: BarChart3 }] : []),
    ...(canViewTeam ? [{ to: '/manager/team', label: copy.team, icon: Network }] : []),
    ...(canViewTeam ? [{ to: '/manager/leave', label: copy.leave, icon: CalendarDays }] : []),
    { to: '/manager/holidays', label: copy.holidays, icon: Sun },
    ...(canViewTeam ? [{ to: '/manager/onboarding', label: copy.onboarding, icon: UserPlus }] : []),
    ...(canViewTeam ? [{ to: '/manager/offboarding', label: copy.offboarding, icon: UserMinus }] : []),
    ...(canApprove ? [{ to: '/manager/approvals', label: copy.approvals, icon: ClipboardCheck }] : []),
    ...(canViewWorkflows ? [{ to: '/manager/workflows', label: copy.workflows, icon: GitBranch }] : []),
    ...(canViewNotifications
      ? [
          {
            to: '/manager/notifications',
            label: copy.notifications,
            icon: Bell,
            badge: unread > 0 ? unread : undefined,
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
          {navigation.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}>
              <Icon size={18} />
              <span>{label}</span>
              {badge !== undefined && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
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
