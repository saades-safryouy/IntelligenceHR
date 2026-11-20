import { useEffect, useState } from 'react'
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
  Workflow,
  Network,
  X,
} from 'lucide-react'
import { useAuth } from '../../contexts/authHooks'
import type { Language, Theme } from '../../contexts/I18nContext'
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

  const navItems = [
    { label: 'Dashboard', path: '/employee/dashboard', icon: LayoutDashboard },
    { label: 'My Profile', path: '/employee/profile', icon: User },
    { label: 'Leave', path: '/employee/leave', icon: CalendarDays },
    { label: 'Holidays', path: '/employee/holidays', icon: CalendarDays },
    { label: 'Onboarding', path: '/employee/onboarding', icon: ClipboardCheck },
    { label: 'Offboarding', path: '/employee/offboarding', icon: User },
    { label: 'Notifications', path: '/employee/notifications', icon: Bell },
    { label: 'Organization', path: '/employee/organigram', icon: Network },
    { label: 'Workflows', path: '/employee/workflows', icon: Workflow },
    { label: 'Documents', path: '/employee/documents', icon: FolderOpen },
  ]

  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand-wrap">
          <Brand compact={collapsed} theme={theme} darkSurface />
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
          {navItems.map((item) => (
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
