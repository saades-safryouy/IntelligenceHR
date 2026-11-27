import { Fragment, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  User,
  WalletCards,
  Workflow,
  Network,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/authHooks'
import type { Language, Theme } from '../../contexts/I18nContext'
import { useI18n } from '../../contexts/I18nContext'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { EmployeeNotificationPanel } from '../notifications/EmployeeNotificationPanel'
import { employeeDashboardTranslations } from '../../pages/employee/translations'
import { GlobalSearch } from './GlobalSearch'
import { getUnreadCount, resolveEmployee } from '../../data/employeeStore'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import { apiRequest, isApiDataMode } from '../../lib/apiClient'

interface ApiUnreadNotifications {
  total: number
}

export function EmployeeLayout({
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
  useEmployeeStore()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [apiUnread, setApiUnread] = useState<number | null>(null)
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const t = employeeDashboardTranslations[language]
  const { text } = useI18n()
  const employee = resolveEmployee(currentUser)
  const unread = isApiDataMode ? apiUnread ?? 0 : employee ? getUnreadCount(employee.userId) : 0

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    apiRequest<ApiUnreadNotifications>('/api/v1/notifications?unread=1&pageSize=1')
      .then((response) => { if (active) setApiUnread(response.total) })
      .catch((cause: unknown) => { console.error('Failed to load unread notifications:', cause) })
    return () => { active = false }
  }, [])

  // Sidebar sections, in display order. The first section ('overview') renders
  // no header: the employee-portal label above the nav already labels it.
  const navSections = [
    { id: 'overview', headerKey: 'NAV_SECTION_OVERVIEW' },
    { id: 'timeLeave', headerKey: 'NAV_SECTION_TIME_LEAVE' },
    { id: 'lifecycle', headerKey: 'NAV_SECTION_LIFECYCLE' },
    { id: 'workspace', headerKey: 'NAV_SECTION_WORKSPACE' },
    { id: 'payroll', headerKey: 'NAV_SECTION_PAYROLL' },
  ] as const

  const navItems = [
    { label: 'Dashboard', path: '/employee/dashboard', icon: LayoutDashboard, section: 'overview' },
    { label: 'My Profile', path: '/employee/profile', icon: User, section: 'overview' },
    { label: 'Leave', path: '/employee/leave', icon: CalendarDays, section: 'timeLeave' },
    { label: 'Holidays', path: '/employee/holidays', icon: CalendarDays, section: 'timeLeave' },
    { label: 'Onboarding', path: '/employee/onboarding', icon: ClipboardCheck, section: 'lifecycle' },
    { label: 'Offboarding', path: '/employee/offboarding', icon: User, section: 'lifecycle' },
    { label: 'Notifications', path: '/employee/notifications', icon: Bell, section: 'workspace' },
    { label: 'Organization', path: '/employee/organigram', icon: Network, section: 'workspace' },
    { label: 'Workflows', path: '/employee/workflows', icon: Workflow, section: 'workspace' },
    { label: 'Documents', path: '/employee/documents', icon: FolderOpen, section: 'workspace' },
    { label: 'My Payslips', path: '/employee/payslips', icon: WalletCards, section: 'payroll' },
  ] as const

  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand-wrap">
          <Brand compact={collapsed} theme={theme} />
          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">{t.employeePortal}</div>

        <nav>
          {navSections.map(({ id, headerKey }) => {
            const items = navItems.filter((item) => item.section === id)
            if (items.length === 0) return null
            return (
              <Fragment key={id}>
                {id !== 'overview' ? <div className="workspace-label">{text(headerKey)}</div> : null}
                {items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </Fragment>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <CircleHelp size={18} />
            <span>{t.help}</span>
          </div>

          <div className="mini-user">
            <div className="avatar">{currentUser?.initials}</div>
            {!collapsed && (
              <div>
                <strong>{currentUser?.name}</strong>
                <span>{currentUser?.title || t.employeePortal}</span>
              </div>
            )}
            <MoreHorizontal size={16} />
          </div>

          <button
            className="sidebar-logout"
            onClick={handleLogout}
            title={collapsed ? t.logout : undefined}
            aria-label={t.logout}
          >
            <LogOut size={17} />
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

      <main className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <button
            className="icon-button collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>

          <GlobalSearch
            placeholder={t.search}
            modules={navItems.map(({ label, path }) => ({ label, to: path }))}
            employeeTo="/employee/profile"
            onNavigate={navigate}
          />

          <div className="top-actions">
            <LanguageSwitch language={language} onChange={onLanguageChange} />

            <button
              className="theme-toggle"
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label={t.notifications}
              >
                <Bell size={19} />
                {unread > 0 && <i>{unread}</i>}
              </button>
              {showNotifications && <EmployeeNotificationPanel onUnreadChange={setApiUnread} />}
            </div>

            <div className="top-user">
              <div className="avatar">{currentUser?.initials}</div>
              <div>
                <strong>{currentUser?.name}</strong>
                <span>{currentUser?.title || t.employeePortal}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
