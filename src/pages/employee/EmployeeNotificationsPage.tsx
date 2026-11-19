import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { PageHeader } from '../../components/common/PageHeader'
import {
  getMyNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  resolveEmployee,
} from '../../data/employeeStore'
import { apiNotificationBody, apiNotificationTitle, employeeDashboardTranslations } from './translations'
import { EmptyState, NotificationItem } from './components'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import { apiData, apiRequest, isApiDataMode } from '../../lib/apiClient'

interface ApiNotification {
  id: string
  type: string
  title: string
  body: string | null
  resource_type: string | null
  resource_id: string | null
  created_at: string
  read_at: string | null
}

interface ApiNotificationPage {
  data: ApiNotification[]
  page: number
  pageSize: number
  total: number
}

export function EmployeeNotificationsPage() {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language, text } = useI18n()
  const navigate = useNavigate()
  const t = employeeDashboardTranslations[language]
  const [apiItems, setApiItems] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadApiNotifications = async () => {
    setError('')
    try {
      const page = await apiRequest<ApiNotificationPage>('/api/v1/notifications?pageSize=100')
      setApiItems(page.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isApiDataMode) void loadApiNotifications()
  }, [])

  const readNotification = async (item: ApiNotification) => {
    try {
      if (!item.read_at) {
        await apiData(`/api/v1/notifications/${item.id}/read`, { method: 'PATCH' })
        setApiItems((items) => items.map((notification) =>
          notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification,
        ))
      }
      if (item.resource_type === 'workflow_instance' && item.resource_id) {
        navigate(`/employee/workflows/${item.resource_id}`)
      } else if (item.resource_type === 'employee_document' && item.resource_id) {
        navigate('/employee/documents')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The notification could not be marked as read.')
    }
  }

  const readAllNotifications = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const first = await apiRequest<ApiNotificationPage>('/api/v1/notifications?unread=1&pageSize=100')
      const unread = [...first.data]
      for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
        const next = await apiRequest<ApiNotificationPage>(`/api/v1/notifications?unread=1&page=${page}&pageSize=100`)
        unread.push(...next.data)
      }
      for (let offset = 0; offset < unread.length; offset += 100) {
        await apiData('/api/v1/notifications/read', {
          method: 'POST',
          body: JSON.stringify({ notificationIds: unread.slice(offset, offset + 100).map((item) => item.id) }),
        })
      }
      await loadApiNotifications()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notifications could not be marked as read.')
    } finally {
      setBusy(false)
    }
  }

  if (isApiDataMode) {
    const unreadCount = apiItems.filter((item) => !item.read_at).length
    return (
      <div className="page employee-page">
        <PageHeader eyebrow={t.employeePortal} title={t.notifications} subtitle={t.inboxSubtitle}>
          {unreadCount > 0 && (
            <button type="button" className="button secondary" disabled={busy} onClick={() => void readAllNotifications()}>
              {t.markRead}
            </button>
          )}
        </PageHeader>
        {error && <div className="toast-inline toast-error" role="alert">{error}</div>}
        <section className="panel">
          {loading ? <div className="empty-state" role="status">{text('Loading notifications…')}</div> : apiItems.length ? (
            apiItems.map((item) => (
              item.resource_type === 'workflow_instance' && item.resource_id ? (
                <Link
                  className="notification notification-button"
                  key={item.id}
                  to={`/employee/workflows/${item.resource_id}`}
                  onClick={(event) => {
                    event.preventDefault()
                    void readNotification(item)
                  }}
                >
                  <span className="notification-icon info"><span aria-hidden="true">✓</span></span>
                  <span className="notification-copy">
                    <strong>{apiNotificationTitle(item.type, item.title, t)}</strong>
                    <span>{apiNotificationBody(item.type, item.body, t)}</span>
                    <small>{new Date(item.created_at).toLocaleString()}</small>
                  </span>
                </Link>
              ) : (
                <button type="button" className={`notification notification-button ${item.read_at ? 'read' : 'unread'}`} key={item.id} onClick={() => void readNotification(item)}>
                  <span className="notification-icon info"><span aria-hidden="true">•</span></span>
                  <span className="notification-copy">
                    <strong>{apiNotificationTitle(item.type, item.title, t)}</strong>
                    <span>{apiNotificationBody(item.type, item.body, t)}</span>
                    <small>{new Date(item.created_at).toLocaleString()}</small>
                  </span>
                </button>
              )
            ))
          ) : !error ? <EmptyState title={t.noNotifications} /> : null}
        </section>
      </div>
    )
  }

  const employee = resolveEmployee(currentUser)

  if (!employee) {
    return (
      <div className="page">
        <div className="empty-block">{t.notFound}</div>
      </div>
    )
  }

  const items = getMyNotifications(employee.userId)
  const unread = getUnreadCount(employee.userId)

  return (
    <div className="page employee-page">
      <PageHeader eyebrow={t.employeePortal} title={t.notifications} subtitle={t.inboxSubtitle}>
        {unread > 0 && (
          <button
            className="button secondary"
            onClick={() => {
              markAllNotificationsRead(employee.userId)
            }}
          >
            {t.markRead}
          </button>
        )}
      </PageHeader>

      <section className="panel">
        {items.length ? (
          items.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              t={t}
              language={language}
              dismissLabel={t.dismissNotification}
              onDismiss={(id) => {
                markNotificationRead(id)
              }}
            />
          ))
        ) : (
          <EmptyState title={t.noNotifications} />
        )}
      </section>
    </div>
  )
}
