import { useCallback, useEffect, useState } from 'react'
import { Download, Eye, FileUp, RotateCw } from 'lucide-react'
import { apiDocumentActions } from '../../data/apiDomainRepositories'
import type { EmployeeDocumentRecord } from '../../types/models'
import { daysUntil, formatDate } from '../../utils/dates'
import { useI18n } from '../../contexts/I18nContext'
import { employeeDashboardTranslations } from './translations'
import { StatusBadge } from './components'

function openDocument(blob: Blob, downloadName: string, preview: boolean) {
  const url = URL.createObjectURL(blob)
  if (preview) {
    const tab = window.open(url, '_blank', 'noopener,noreferrer')
    if (!tab) URL.revokeObjectURL(url)
    else window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  link.click()
  URL.revokeObjectURL(url)
}

export function EmployeeDocumentsPanel({ employeeId }: { employeeId?: number }) {
  const { language } = useI18n()
  const t = employeeDashboardTranslations[language]
  const [documents, setDocuments] = useState<EmployeeDocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const records = await apiDocumentActions.list()
      setDocuments(employeeId ? records.filter((record) => record.employeeId === String(employeeId)) : records)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [employeeId, t.loadFailed])

  useEffect(() => { void load() }, [load, reload])

  const transfer = async (id: string, file?: File, preview = false) => {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      if (file) {
        await apiDocumentActions.upload(id, file, setProgress)
        setMessage(t.documentSubmitted)
        setReload((value) => value + 1)
      } else {
        const result = await apiDocumentActions.file(`/api/v1/employee-documents/${id}/file${preview ? '?inline=1' : ''}`)
        openDocument(result.blob, result.filename, preview)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadFailed)
    } finally {
      setBusyId('')
      setProgress(0)
    }
  }

  return (
    <section className="panel">
      {message && <div className="toast-inline" role="status">{message}</div>}
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}
      {loading ? <div className="empty-state" role="status">{t.loading}</div> : documents.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>{t.documents}</th><th>{t.type}</th><th>{t.uploaded}</th><th>{t.expiry}</th><th>{t.status}</th><th>{t.documentActions}</th></tr>
            </thead>
            <tbody>
              {documents.map((record) => {
                const canSubmit = record.employeeId === String(employeeId ?? '') && ['missing', 'rejected'].includes(record.status)
                const canPreview = record.hasFile && record.status !== 'archived' && ['application/pdf', 'image/jpeg', 'image/png'].includes(record.mimeType ?? '')
                return (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.name}</strong>
                      {record.reviewComment && <small className="muted-note">{record.reviewComment}</small>}
                    </td>
                    <td>{record.type}</td>
                    <td>{record.uploadedAt ? formatDate(record.uploadedAt, language) : '—'}</td>
                    <td>
                      {record.expiryDate ? formatDate(record.expiryDate, language) : '—'}
                      {record.expiryDate && record.status !== 'archived' && daysUntil(record.expiryDate) >= 0 && daysUntil(record.expiryDate) <= 30
                        ? <small className="muted-note">{t.expiringSoon}</small>
                        : null}
                    </td>
                    <td><StatusBadge status={record.status} label={t[record.status as keyof typeof t] || record.status} /></td>
                    <td>
                      <div className="document-actions">
                        {record.hasFile && record.status !== 'archived' && (
                          <>
                            {canPreview && <button className="icon-button" aria-label={t.previewDocument} disabled={busyId === record.id} onClick={() => void transfer(record.id, undefined, true)}><Eye size={16} /></button>}
                            <button className="icon-button" aria-label={t.download} disabled={busyId === record.id} onClick={() => void transfer(record.id)}><Download size={16} /></button>
                          </>
                        )}
                        {canSubmit && (
                          <label className="button secondary document-upload-button">
                            <FileUp size={15} />{record.status === 'rejected' ? t.replaceDocument : t.uploadDocument}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.docx"
                              disabled={busyId === record.id}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0]
                                if (file) void transfer(record.id, file)
                                event.currentTarget.value = ''
                              }}
                            />
                          </label>
                        )}
                        {busyId === record.id && progress > 0 && <progress max={100} value={progress} aria-label={`${progress}%`} />}
                        {busyId === record.id && progress === 0 && <RotateCw size={15} className="spin" aria-label={t.loading} />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <div className="empty-state" role="status">{t.noDocuments}</div>}
    </section>
  )
}
