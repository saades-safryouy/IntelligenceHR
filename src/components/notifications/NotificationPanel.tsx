import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { AlertCircle, ArrowUpRight, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { notifications as mockNotifications } from '../../data/mock'
import { useI18n } from '../../contexts/I18nContext'
import { apiData, apiRequest, isApiDataMode } from '../../lib/apiClient'

interface ApiNotification {
  id: string
  type: string
  title: string
  body: string
  resource_type: string | null
  resource_id: string | null
  created_at: string
  read_at: string | null
}

interface NotificationPage {
  data: ApiNotification[]
  page: number
  pageSize: number
  total: number
}

export function NotificationPanel({ onUnreadCountChange }: { onUnreadCountChange?: Dispatch<SetStateAction<number>> }) {
  const { text } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [items, setItems] = useState<ApiNotification[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async () => {
    if (!isApiDataMode) return
    setError('')
    try {
      const [page, unreadPage] = await Promise.all([
        apiRequest<NotificationPage>('/api/v1/notifications?pageSize=8'),
        apiRequest<NotificationPage>('/api/v1/notifications?unread=1&pageSize=1'),
      ])
      setItems(page.data)
      onUnreadCountChange?.(unreadPage.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [onUnreadCountChange])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  const markRead = async (item: ApiNotification) => {
    if (!isApiDataMode) return
    try {
      if (!item.read_at) {
        await apiData(`/api/v1/notifications/${item.id}/read`, { method: 'PATCH' })
        setItems((current) => current.map((notification) =>
          notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification,
        ))
        onUnreadCountChange?.((count) => Math.max(0, count - 1))
      }
      if (item.resource_type === 'workflow_instance' && item.resource_id) {
        navigate(`${pathname.startsWith('/manager/') ? '/manager' : '/app'}/workflows/${item.resource_id}`)
      } else if (item.resource_type === 'employee_document' && item.resource_id) {
        navigate('/app/documents')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The notification could not be marked as read.')
    }
  }

  const markAllRead = async () => {
    if (!isApiDataMode || busy) return
    setBusy(true)
    setError('')
    try {
      const first = await apiRequest<NotificationPage>('/api/v1/notifications?unread=1&pageSize=100')
      const unread = [...first.data]
      for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
        const next = await apiRequest<NotificationPage>(`/api/v1/notifications?unread=1&page=${page}&pageSize=100`)
        unread.push(...next.data)
      }
      for (let offset = 0; offset < unread.length; offset += 100) {
        await apiData('/api/v1/notifications/read', {
          method: 'POST',
          body: JSON.stringify({ notificationIds: unread.slice(offset, offset + 100).map((notification) => notification.id) }),
        })
      }
      await loadNotifications()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notifications could not be marked as read.')
    } finally {
      setBusy(false)
    }
  }

  if (!isApiDataMode) {
    return (
      <div className="notification-panel">
        <div className="panel-heading"><strong>{text('Notifications')}</strong><button>{text('Mark all read')}</button></div>
        {mockNotifications.map((notification) => (
          <div className="notification" key={notification.id}>
            <NotificationIcon type={notification.type} />
            <div><strong>{text(notification.title)}</strong><span>{text(notification.detail)}</span><small>{text(notification.time)}</small></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="notification-panel">
      <div className="panel-heading">
        <strong>{text('Notifications')}</strong>
        <button type="button" disabled={busy} onClick={() => void markAllRead()}>{text('Mark all read')}</button>
      </div>
      {error && <div className="notification-error" role="alert">{error}</div>}
      {loading ? <div className="notification-state">{text('Loading notifications…')}</div> : items.length ? items.map((item) => (
        <button type="button" className={`notification notification-button ${item.read_at ? 'read' : 'unread'}`} key={item.id} onClick={() => void markRead(item)}>
          <NotificationIcon type={item.type} />
          <span className="notification-copy">
            <strong>{item.title}</strong>
            <span>{item.body}</span>
            <small>{new Date(item.created_at).toLocaleString()}</small>
          </span>
          {['workflow_instance', 'employee_document'].includes(item.resource_type ?? '') && <ArrowUpRight size={14} />}
        </button>
      )) : !error ? <div className="notification-state">{text('No notifications')}</div> : null}
    </div>
  )
}

function NotificationIcon({ type }: { type: string }) {
  const normalizedType = type.toLowerCase()
  const Icon = normalizedType.includes('warning')
    ? AlertCircle
    : normalizedType.includes('success')
      ? CheckCircle2
      : ClipboardCheck
  return <span className={`notification-icon ${normalizedType.includes('warning') ? 'warning' : normalizedType.includes('success') ? 'success' : 'info'}`}><Icon size={15} /></span>
}
