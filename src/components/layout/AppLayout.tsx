import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  CircleHelp,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  X,
} from 'lucide-react'
import { navItems, futureModules } from '../../data/navigation'
import { useI18n, translations } from '../../contexts/I18nContext'
import type { Language, Theme } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/authHooks'
import { Brand } from './Brand'
import { LanguageSwitch } from './LanguageSwitch'
import { NotificationPanel } from '../notifications/NotificationPanel'
import { isApiDataMode } from '../../lib/apiClient'
import { GlobalSearch } from './GlobalSearch'

export function AppLayout({
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
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const { text } = useI18n()
  const { currentUser, hasPermission } = useAuth()
  const navigate = useNavigate()
  const leaveLabel = translations[language].leave && typeof translations[language].leave === 'object'
    ? translations[language].leave.label
    : 'Leave'
  const navText: Record<string, string> = {
    dashboard: translations[language].dashboard,
    people: translations[language].people,
    departments: translations[language].departments,
    organigramme: 'Organization',
    onboarding: translations[language].onboarding,
    offboarding: translations[language].offboarding,
    leave: leaveLabel,
    holidays: translations[language].holidays,
    documents: translations[language].documents,
    calendar: translations[language].calendar,
    training: translations[language].training,
    attendance: translations[language].attendance,
    performance: translations[language].performance,
    recruitment: translations[language].recruitment,
    payroll: translations[language].payroll,
    reports: translations[language].reports,
    workflows: translations[language].workflows,
    settings: translations[language].settings,
    askIntelligence: translations[language].askIntelligence,
    automations: translations[language].automations,
    advancedSettings: translations[language].advancedSettings,
  }

  return (
    <div className="app-frame">
      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${
          mobileOpen ? 'mobile-open' : ''
        }`}
      >
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

        <div className="workspace-label">{text('WORKSPACE')}</div>

        <nav>
          {navItems.filter(({ permissions }) => !permissions || permissions.some(hasPermission)).map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? navText[label] ?? label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} />
              <span>{navText[label] ?? label}</span>
              {badge && <em>{badge}</em>}
            </NavLink>
          ))}
        </nav>

        {futureModules.length > 0 ? (
          <div className="sidebar-group">
            <small>{text('EXTENDED MODULES')}</small>
            {futureModules.map(({ path, title, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={16} />
                <span>{text(title)}</span>
              </NavLink>
            ))}
          </div>
        ) : null}

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <CircleHelp size={18} />
            <span>{text('Help & support')}</span>
          </div>

          <div className="mini-user">
            <div className="avatar">{currentUser?.initials ?? '??'}</div>
            {!collapsed && (
              <div>
                <strong>{currentUser?.name ?? '—'}</strong>
                <span>{currentUser?.title ?? ''}</span>
              </div>
            )}
            <MoreHorizontal size={16} />
          </div>

          <button
            className="sidebar-logout"
            onClick={() => {
              onLogout()
              navigate('/login', { replace: true })
            }}
            title={collapsed ? 'Logout' : undefined}
            aria-label="Logout"
          >
            <LogOut size={17} />
            <span>Logout</span>
          </button>

          <div className="ecosystem">
            Intelligence AGENCY
            <span>•</span>
            PLATFORM
          </div>
        </div>
      </aside>

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
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>

          <GlobalSearch
            placeholder={translations[language].search}
            modules={navItems.filter(({ permissions }) => !permissions || permissions.some(hasPermission)).map(({ to, label }) => ({ label: navText[label] ?? label, to }))}
            employeeTo="/app/employees"
            onNavigate={navigate}
          />

          <div className="top-actions">
            <LanguageSwitch language={language} onChange={onLanguageChange} />

            <button
              className="theme-toggle"
              onClick={() =>
                onThemeChange(theme === 'dark' ? 'light' : 'dark')
              }
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                onClick={() => setShowNotifications(!showNotifications)}
                aria-label={text('Notifications')}
              >
                <Bell size={19} />
                {isApiDataMode ? unreadNotifications > 0 && <i>{unreadNotifications}</i> : <i>2</i>}
              </button>
              {showNotifications && <NotificationPanel onUnreadCountChange={setUnreadNotifications} />}
            </div>

            <div className="top-user">
              <div className="avatar">{currentUser?.initials ?? '??'}</div>
              <div>
                <strong>{currentUser?.name ?? '—'}</strong>
                <span>{currentUser?.title ?? ''}</span>
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
