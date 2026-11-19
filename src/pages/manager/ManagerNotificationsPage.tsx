import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCheck,
  Clock,
  ExternalLink,
  GitBranch,
  FileText,
  Mail,
  MailOpen,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import {
  listManagerNotifications,
  markManagerNotificationRead,
  markAllManagerNotificationsRead,
  type ManagerNotification,
} from '../../data/managerDashboardRepository'
import { managerTranslations } from './translations'
import './ManagerDashboard.css'

export function ManagerNotificationsPage() {
  const { hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = managerTranslations[language]
  const navigate = useNavigate()
  const canViewNotifications = hasPermission('notification.view')

  const [items, setItems] = useState<ManagerNotification[]>([])
  const [loading, setLoading] = useState(isApiDataMode && canViewNotifications)
  const [error, setError] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!isApiDataMode || !canViewNotifications) return
    setLoading(true)
    setError('')
    try {
      const data = await listManagerNotifications(unreadOnly)
      setItems(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [canViewNotifications, unreadOnly, copy.loadError])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read_at).length,
    [items],
  )

  const handleMarkRead = async (item: ManagerNotification) => {
    if (item.read_at) {
      if (item.resource_type === 'workflow_instance' && item.resource_id) {
        navigate(`/manager/workflows/${item.resource_id}`)
      }
      return
    }
    try {
      await markManagerNotificationRead(item.id)
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      )
      if (item.resource_type === 'workflow_instance' && item.resource_id) {
        navigate(`/manager/workflows/${item.resource_id}`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    }
  }

  const handleMarkAllRead = async () => {
    if (busy || unreadCount === 0) return
    setBusy(true)
    setError('')
    try {
      await markAllManagerNotificationsRead()
      setItems((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.loadError)
    } finally {
      setBusy(false)
    }
  }

  if (!canViewNotifications) {
    return (
      <div className="manager-page">
        <PageHeader eyebrow={copy.portal} title={copy.notificationsManagement} subtitle={copy.notificationsManagementSubtitle} />
        <div className="manager-error-banner">{copy.noTeamAccess}</div>
      </div>
    )
  }

  return (
    <div className="manager-page">
      <Breadcrumb
        items={[
          { label: copy.portal, path: '/manager/dashboard' },
          { label: copy.notifications },
        ]}
      />

      <PageHeader
        eyebrow={copy.portal}
        title={copy.notificationsManagement}
        subtitle={copy.notificationsManagementSubtitle}
      >
        <button
          type="button"
          className="button secondary"
          onClick={() => void handleMarkAllRead()}
          disabled={busy || unreadCount === 0}
        >
          <CheckCheck size={16} />
          <span>{copy.markAllRead}</span>
        </button>
      </PageHeader>

      <div className="manager-kpi-grid">
        <div className="manager-kpi-card">
          <div className="manager-kpi-icon blue">
            <Bell size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.notifications}</span>
            <strong className="manager-kpi-value">{items.length}</strong>
          </div>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon orange">
            <Mail size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.unreadOnly}</span>
            <strong className="manager-kpi-value">{unreadCount}</strong>
          </div>
      <section className="manager-section">
        <div className="manager-filter-bar">
          <div className="manager-status-pills">
            <button
              type="button"
              className={`manager-filter-pill ${!unreadOnly ? 'active' : ''}`}
              onClick={() => setUnreadOnly(false)}
            >
              {copy.all}
            </button>
            <button
              type="button"
              className={`manager-filter-pill ${unreadOnly ? 'active' : ''}`}
              onClick={() => setUnreadOnly(true)}
            >
              {copy.unreadOnly} {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="manager-loading-state">{copy.loading}</div>
        ) : error ? (
          <div className="manager-error-banner">
            <span>{error}</span>
            <button type="button" onClick={() => void loadNotifications()}>
              {copy.retry}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="manager-empty-state">
            <Bell size={32} />
            <p>{copy.noNotifications}</p>
          </div>
        ) : (
          <div className="manager-notifications-list">
            {items.map((n) => {
              const isUnread = !n.read_at
              const isWorkflow = n.resource_type === 'workflow_instance'

              return (
                <div
                  key={n.id}
                  className={`manager-notification-item ${isUnread ? 'unread' : 'read'}`}
                  onClick={() => void handleMarkRead(n)}
                >
                  <div className="manager-notification-icon">
                    {isWorkflow ? <GitBranch size={18} /> : <FileText size={18} />}
                  </div>

                  <div className="manager-notification-content">
                    <div className="manager-notification-top">
                      <strong>{n.title}</strong>
                      <div className="manager-cell-dates">
                        <Clock size={12} />
                        <small>{n.created_at ? n.created_at.slice(0, 16).replace('T', ' ') : ''}</small>
                      </div>
                    </div>

                    {n.body && <p className="manager-notification-body">{n.body}</p>}

                    <div className="manager-notification-footer">
                      {isWorkflow && (
                        <span className="manager-link-hint">
                          <span>{copy.viewDetails}</span>
                          <ExternalLink size={12} />
                        </span>
                      )}
                      {isUnread && (
                        <span className="manager-unread-dot" title={copy.unreadOnly} />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
        </div>

        <div className="manager-kpi-card">
          <div className="manager-kpi-icon mint">
            <MailOpen size={20} />
          </div>
          <div className="manager-kpi-meta">
            <span className="manager-kpi-label">{copy.completed}</span>
            <strong className="manager-kpi-value">{items.length - unreadCount}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
