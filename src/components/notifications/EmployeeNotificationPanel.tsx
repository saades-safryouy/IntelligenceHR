import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import {
  getMyNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  resolveEmployee,
} from '../../data/employeeStore'
import { formatDate } from '../../utils/dates'
import {
  apiNotificationBody,
  apiNotificationTitle,
  employeeDashboardTranslations,
  interpolate,
  notifTitleKey,
} from '../../pages/employee/translations'
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

export function EmployeeNotificationPanel({ onUnreadChange }: { onUnreadChange?: (count: number) => void }) {
  useEmployeeStore()
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const navigate = useNavigate()
  const t = employeeDashboardTranslations[language]
  const employee = resolveEmployee(currentUser)
  const items = employee ? getMyNotifications(employee.userId).slice(0, 6) : []
  const unread = employee ? getUnreadCount(employee.userId) : 0
  const [apiItems, setApiItems] = useState<ApiNotification[]>([])
  const [apiUnreadCount, setApiUnreadCount] = useState(0)
  const [apiLoading, setApiLoading] = useState(isApiDataMode)
  const [apiBusy, setApiBusy] = useState(false)
  const [apiError, setApiError] = useState('')

  const loadApiNotifications = useCallback(async () => {
    setApiError('')
    try {
      const [all, unreadPage] = await Promise.all([
        apiRequest<ApiNotificationPage>('/api/v1/notifications?pageSize=6'),
        apiRequest<ApiNotificationPage>('/api/v1/notifications?unread=1&pageSize=1'),
      ])
      setApiItems(all.data)
      setApiUnreadCount(unreadPage.total)
      onUnreadChange?.(unreadPage.total)
    } catch (cause) {
      setApiError(cause instanceof Error ? cause.message : t.loadFailed)
    } finally {
      setApiLoading(false)
    }
  }, [onUnreadChange, t.loadFailed])

  useEffect(() => {
    if (isApiDataMode) void loadApiNotifications()
  }, [loadApiNotifications])

  const openApiNotification = async (item: ApiNotification) => {
    try {
      if (!item.read_at) {
        await apiData(`/api/v1/notifications/${item.id}/read`, { method: 'PATCH' })
        setApiItems((current) => current.map((notification) =>
          notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification,
        ))
        await loadApiNotifications()
      }
      if (item.resource_type === 'workflow_instance' && item.resource_id) {
        navigate(`/employee/workflows/${item.resource_id}`)
      } else if (item.resource_type === 'employee_document' && item.resource_id) {
        navigate('/employee/documents')
      }
    } catch (cause) {
      setApiError(cause instanceof Error ? cause.message : t.saveFailed)
    }
  }

  const markApiAllRead = async () => {
    if (apiBusy || !apiUnreadCount) return
    setApiBusy(true)
    setApiError('')
    try {
      const first = await apiRequest<ApiNotificationPage>('/api/v1/notifications?unread=1&pageSize=100')
      const unreadItems = [...first.data]
      for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
        const next = await apiRequest<ApiNotificationPage>(`/api/v1/notifications?unread=1&page=${page}&pageSize=100`)
        unreadItems.push(...next.data)
      }
      for (let index = 0; index < unreadItems.length; index += 100) {
        await apiData('/api/v1/notifications/read', {
          method: 'POST',
          body: JSON.stringify({ notificationIds: unreadItems.slice(index, index + 100).map((item) => item.id) }),
        })
      }
      setApiUnreadCount(0)
      onUnreadChange?.(0)
      await loadApiNotifications()
    } catch (cause) {
      setApiError(cause instanceof Error ? cause.message : t.saveFailed)
    } finally {
      setApiBusy(false)
    }
  }

  if (isApiDataMode) {
    return (
      <div className="notification-panel">
        <div className="panel-heading">
          <strong>{t.notifications}</strong>
          {apiUnreadCount > 0 && (
            <button disabled={apiBusy} onClick={() => void markApiAllRead()}>{t.markRead}</button>
          )}
        </div>
        {apiError && <div className="toast-inline toast-error" role="alert">{apiError}</div>}
        {apiLoading ? <div className="notification">{t.loading}</div> : apiItems.length ? (
          apiItems.map((notification) => (
            <button
              type="button"
              className="notification notification-button"
              key={notification.id}
              onClick={() => void openApiNotification(notification)}
            >
              <span className="notification-icon info"><ClipboardCheck size={15} /></span>
              <span className="notification-copy">
                <strong>{apiNotificationTitle(notification.type, notification.title, t)}</strong>
                <span>{apiNotificationBody(notification.type, notification.body, t)}</span>
                <small>{formatDate(notification.created_at, language)}</small>
              </span>
            </button>
          ))
        ) : !apiError ? <div className="notification">{t.noNotifications}</div> : null}
        <Link to="/employee/notifications" className="text-button" style={{ padding: '10px 14px' }}>
          {t.viewAll}
        </Link>
      </div>
    )
  }

  return (
    <div className="notification-panel">
      <div className="panel-heading">
        <strong>{t.notifications}</strong>
        {unread > 0 && employee && (
          <button onClick={() => markAllNotificationsRead(employee.userId)}>{t.markRead}</button>
        )}
      </div>
      {items.length ? (
        items.map((notification) => {
          const title = interpolate(t[notifTitleKey(notification.type)], notification.params)
          return (
            <button
              className="notification"
              key={notification.id}
              onClick={() => markNotificationRead(notification.id)}
            >
              <div
                className={`notification-icon ${
                  notification.type.startsWith('passport') || notification.type === 'leave-rejected'
                    ? 'warning'
                    : notification.type === 'leave-approved'
                      ? 'success'
                      : 'info'
                }`}
              >
                {notification.type.startsWith('passport') || notification.type === 'leave-rejected' ? (
                  <AlertCircle size={15} />
                ) : notification.type === 'leave-approved' ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <ClipboardCheck size={15} />
                )}
              </div>
              <div>
                <strong>{title}</strong>
                <span>{notification.params?.requestId ?? ''}</span>
                <small>{formatDate(notification.createdAt, language)}</small>
              </div>
            </button>
          )
        })
      ) : (
        <div className="notification"><div><strong>{t.noNotifications}</strong></div></div>
      )}
      <Link to="/employee/notifications" className="text-button" style={{ padding: '10px 14px' }}>
        {t.viewAll}
      </Link>
    </div>
  )
}
