import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { Archive, Check, Download, Eye, FileUp, FolderOpen, Search, Trash2, X } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { employeeRepository } from '../../data/mockRepository'
import { apiDocumentActions } from '../../data/apiDomainRepositories'
import type { Employee, EmployeeDocumentRecord } from '../../types/models'
import { formatDate } from '../../utils/dates'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/authHooks'
import { apiData, apiUpload, isApiDataMode } from '../../lib/apiClient'

const categories = ['identity', 'employment', 'certificates', 'contracts', 'administrative', 'other']

const categoryLabels = {
  en: { identity: 'Identity', employment: 'Employment', certificates: 'Certificates', contracts: 'Contracts', administrative: 'Administrative', other: 'Other' },
  fr: { identity: 'Identité', employment: 'Emploi', certificates: 'Certificats', contracts: 'Contrats', administrative: 'Administratif', other: 'Autre' },
  ar: { identity: 'هوية', employment: 'توظيف', certificates: 'شهادات', contracts: 'عقود', administrative: 'إداري', other: 'أخرى' },
}

const copy = {
  en: {
    title: 'Employee documents', subtitle: 'Securely manage employee files and review submissions.',
    total: 'Total', expiring: 'Expiring within 30 days', needsAttention: 'Needs attention', add: 'Request or upload',
    allEmployees: 'All employees', expiryFilter: 'Expiry filter', dueSoon: 'Due within 30 days', noExpiry: 'No expiry date',
    name: 'Document name', employee: 'Employee', category: 'Category', issue: 'Issue date', expiry: 'Expiry date',
    file: 'Choose a file or drop it here', create: 'Save document', cancel: 'Cancel', search: 'Search name or employee',
    status: 'Status', uploaded: 'Uploaded', actions: 'Actions', loading: 'Loading documents…',
    empty: 'No matching documents.', error: 'Could not load documents.', saved: 'Document saved.',
    approved: 'Approve', rejected: 'Reject', archive: 'Archive', remove: 'Delete permanently',
    download: 'Download', preview: 'Preview', reviewComment: 'Review comment (optional)',
    noEmployee: 'No employees are available in your scope.', apiUnavailable: 'Document management requires API mode.',
    chooseEmployee: 'Select an employee', allCategories: 'All categories', allStatuses: 'All statuses',
    pending: 'Pending', under_review: 'Under review', approvedStatus: 'Approved', rejectedStatus: 'Rejected',
    missing: 'Requested', expired: 'Expired', archived: 'Archived', uploading: 'Uploading',
    confirmArchive: 'Archive this document? It will remain retained but unavailable for download.',
    confirmDelete: 'Permanently delete this document and its file?',
    reviewingWorkflow: 'Approval workflow in progress',
  },
  fr: {
    title: 'Documents des employés', subtitle: 'Gérez les fichiers de manière sécurisée et traitez les dépôts.',
    total: 'Total', expiring: 'Expiration sous 30 jours', needsAttention: 'À traiter', add: 'Demander ou déposer',
    allEmployees: 'Tous les employés', expiryFilter: 'Filtre d’expiration', dueSoon: 'Expire sous 30 jours', noExpiry: 'Sans date d’expiration',
    name: 'Nom du document', employee: 'Employé', category: 'Catégorie', issue: 'Date d’émission', expiry: 'Expiration',
    file: 'Choisir un fichier ou le déposer ici', create: 'Enregistrer', cancel: 'Annuler', search: 'Rechercher un nom ou un employé',
    status: 'Statut', uploaded: 'Déposé', actions: 'Actions', loading: 'Chargement des documents…',
    empty: 'Aucun document correspondant.', error: 'Impossible de charger les documents.', saved: 'Document enregistré.',
    approved: 'Approuver', rejected: 'Refuser', archive: 'Archiver', remove: 'Supprimer définitivement',
    download: 'Télécharger', preview: 'Aperçu', reviewComment: 'Commentaire (facultatif)',
    noEmployee: 'Aucun employé disponible dans votre périmètre.', apiUnavailable: 'La gestion des documents nécessite le mode API.',
    chooseEmployee: 'Choisir un employé', allCategories: 'Toutes les catégories', allStatuses: 'Tous les statuts',
    pending: 'En attente', under_review: 'En vérification', approvedStatus: 'Approuvé', rejectedStatus: 'Refusé',
    missing: 'Demandé', expired: 'Expiré', archived: 'Archivé', uploading: 'Envoi en cours',
    confirmArchive: 'Archiver ce document ? Il sera conservé mais ne pourra plus être téléchargé.',
    confirmDelete: 'Supprimer définitivement ce document et son fichier ?',
    reviewingWorkflow: 'Circuit d’approbation en cours',
  },
  ar: {
    title: 'مستندات الموظفين', subtitle: 'إدارة الملفات بأمان ومراجعة المستندات المقدمة.',
    total: 'الإجمالي', expiring: 'تنتهي خلال 30 يوماً', needsAttention: 'تحتاج إلى إجراء', add: 'طلب أو رفع',
    allEmployees: 'كل الموظفين', expiryFilter: 'تصفية الانتهاء', dueSoon: 'تنتهي خلال 30 يوماً', noExpiry: 'بدون تاريخ انتهاء',
    name: 'اسم المستند', employee: 'الموظف', category: 'الفئة', issue: 'تاريخ الإصدار', expiry: 'تاريخ الانتهاء',
    file: 'اختر ملفاً أو اسحبه هنا', create: 'حفظ المستند', cancel: 'إلغاء', search: 'ابحث بالاسم أو الموظف',
    status: 'الحالة', uploaded: 'تاريخ الرفع', actions: 'الإجراءات', loading: 'جارٍ تحميل المستندات…',
    empty: 'لا توجد مستندات مطابقة.', error: 'تعذر تحميل المستندات.', saved: 'تم حفظ المستند.',
    approved: 'موافقة', rejected: 'رفض', archive: 'أرشفة', remove: 'حذف نهائي',
    download: 'تنزيل', preview: 'معاينة', reviewComment: 'تعليق المراجعة (اختياري)',
    noEmployee: 'لا يوجد موظفون ضمن نطاق صلاحياتك.', apiUnavailable: 'إدارة المستندات تتطلب وضع API.',
    chooseEmployee: 'اختر موظفاً', allCategories: 'كل الفئات', allStatuses: 'كل الحالات',
    pending: 'قيد الانتظار', under_review: 'قيد المراجعة', approvedStatus: 'موافق عليه', rejectedStatus: 'مرفوض',
    missing: 'مطلوب', expired: 'منتهي', archived: 'مؤرشف', uploading: 'جارٍ الرفع',
    confirmArchive: 'أرشفة هذا المستند؟ سيبقى محفوظاً ولن يكون متاحاً للتنزيل.',
    confirmDelete: 'حذف هذا المستند وملفه نهائياً؟',
    reviewingWorkflow: 'مسار الموافقة قيد التنفيذ',
  },
}

function openFile(blob: Blob, filename: string, preview: boolean) {
  const url = URL.createObjectURL(blob)
  if (preview) {
    const tab = window.open(url, '_blank', 'noopener,noreferrer')
    if (tab) window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    else URL.revokeObjectURL(url)
    return
  }
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function DocumentsPage() {
  const { language } = useI18n()
  const { hasPermission } = useAuth()
  const t = copy[language]
  const categoryText = categoryLabels[language]
  const statusText = {
    missing: t.missing,
    pending: t.pending,
    under_review: t.under_review,
    approved: t.approvedStatus,
    rejected: t.rejectedStatus,
    expired: t.expired,
    archived: t.archived,
  }
  const canManage = hasPermission('people.document.upload') || hasPermission('people.employee.update')
  const canReview = hasPermission('people.document.review') || hasPermission('people.employee.update')
  const canArchive = hasPermission('people.document.archive') || hasPermission('people.employee.update')
  const canDelete = hasPermission('people.document.delete') || hasPermission('people.employee.update')
  const [documents, setDocuments] = useState<EmployeeDocumentRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expiryFilter, setExpiryFilter] = useState('')
  const [sort, setSort] = useState('uploaded-desc')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [progress, setProgress] = useState(0)
  const [reload, setReload] = useState(0)

  const load = useCallback(async () => {
    if (!isApiDataMode) return
    setLoading(true)
    setError('')
    try {
      const [records, page] = await Promise.all([
        apiDocumentActions.list({
          search: search.trim() || undefined,
          employeeId: employeeFilter || undefined,
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          expiresAfter: expiryFilter === 'soon' ? new Date().toISOString().slice(0, 10) : undefined,
          expiresBefore: expiryFilter === 'soon' ? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) : undefined,
          hasExpiry: expiryFilter === 'none' ? false : undefined,
        }),
        employeeRepository.list({ page: 1, pageSize: 100 }),
      ])
      setDocuments(records)
      const allEmployees = [...page.data]
      for (let currentPage = 2; currentPage <= Math.ceil(page.total / page.pageSize); currentPage += 1) {
        allEmployees.push(...(await employeeRepository.list({ page: currentPage, pageSize: 100 })).data)
      }
      setEmployees(allEmployees)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, employeeFilter, expiryFilter, reload, search, statusFilter, t.error])

  useEffect(() => { void load() }, [load])

  const sortedDocuments = useMemo(() => [...documents].sort((a, b) => {
    const [field, direction] = sort.split('-')
    const left = field === 'name' ? a.name : field === 'expiry' ? a.expiryDate ?? '' : a.uploadedAt
    const right = field === 'name' ? b.name : field === 'expiry' ? b.expiryDate ?? '' : b.uploadedAt
    return left.localeCompare(right) * (direction === 'asc' ? 1 : -1)
  }), [documents, sort])

  const saveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const documentForm = new FormData()
    documentForm.append('employee_id', String(values.get('employeeId') || ''))
    documentForm.append('name', String(values.get('name') || ''))
    documentForm.append('type', String(values.get('category') || 'other'))
    const issueDate = String(values.get('issueDate') || '')
    const expiryDate = String(values.get('expiryDate') || '')
    if (issueDate) documentForm.append('issue_date', issueDate)
    if (expiryDate) documentForm.append('expiry_date', expiryDate)
    setError('')
    setNotice('')
    setSaving(true)
    try {
      if (file) {
        const response = await apiUpload<{ data: unknown }>('/api/v1/employee-documents', documentFormWithFile(documentForm, file), setProgress)
        if (!response.data) throw new Error(t.error)
      } else {
        await apiData('/api/v1/employee-documents', {
          method: 'POST',
          body: JSON.stringify({
            employee_id: values.get('employeeId'),
            name: values.get('name'),
            type: values.get('category'),
            issue_date: issueDate || null,
            expiry_date: expiryDate || null,
          }),
        })
      }
      setNotice(t.saved)
      setFile(null)
      setShowForm(false)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error)
    } finally {
      setProgress(0)
      setSaving(false)
    }
  }

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setProgress(0)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(t.saved)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error)
    } finally {
      setBusyId('')
      setProgress(0)
      setProgress(0)
    }
  }

  const review = (document: EmployeeDocumentRecord, status: 'approved' | 'rejected') => {
    const comment = window.prompt(t.reviewComment, document.reviewComment ?? '')
    if (comment === null) return
    void runAction(document.id, () => apiDocumentActions.review(document.id, status, comment))
  }

  const transfer = async (document: EmployeeDocumentRecord, preview = false) => {
    setBusyId(document.id)
    try {
      const fileResult = await apiDocumentActions.file(`/api/v1/employee-documents/${document.id}/file${preview ? '?inline=1' : ''}`)
      openFile(fileResult.blob, fileResult.filename, preview)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error)
    } finally {
      setBusyId('')
    }
  }

  const withinThirtyDays = documents.filter((document) => {
    if (!document.expiryDate || document.status === 'archived') return false
    const days = Math.ceil((new Date(document.expiryDate).getTime() - Date.now()) / 86_400_000)
    return days >= 0 && days <= 30
  }).length
  const attention = documents.filter((document) => ['missing', 'pending', 'under_review', 'rejected', 'expired'].includes(document.status)).length

  if (!isApiDataMode) {
    return <div className="page"><PageHeader eyebrow="PEOPLE RECORDS" title={t.title} subtitle={t.subtitle} /><div className="empty-state">{t.apiUnavailable}</div></div>
  }

  return (
    <div className="page">
      <PageHeader eyebrow="PEOPLE RECORDS" title={t.title} subtitle={t.subtitle}>
        {canManage && <button className="button primary" onClick={() => setShowForm((value) => !value)}><FileUp size={16} />{t.add}</button>}
      </PageHeader>
      {notice && <div className="toast-inline" role="status">{notice}</div>}
      {error && <div className="toast-inline toast-error" role="alert">{error}</div>}
      <section className="panel document-panel">
        <div className="document-summary">
          <div><span>{t.total}</span><strong>{documents.length}</strong></div>
          <div><span>{t.expiring}</span><strong className="orange-text">{withinThirtyDays}</strong></div>
          <div><span>{t.needsAttention}</span><strong className="red-text">{attention}</strong></div>
        </div>

        {showForm && (
          <form className="leave-form document-form" onSubmit={(event) => void saveDocument(event)}>
            <label>{t.employee}
              <select name="employeeId" required defaultValue="">
                <option value="" disabled>{t.chooseEmployee}</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
              </select>
            </label>
            <label>{t.name}<input name="name" required maxLength={255} /></label>
            <label>{t.category}
              <select name="category" defaultValue="identity">{categories.map((category) => <option key={category} value={category}>{categoryText[category as keyof typeof categoryText]}</option>)}</select>
            </label>
            <label>{t.issue}<input type="date" name="issueDate" /></label>
            <label>{t.expiry}<input type="date" name="expiryDate" /></label>
            <div
              className={`document-dropzone ${dragging ? 'is-dragging' : ''}`}
              onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault()
                setDragging(false)
                setFile(event.dataTransfer.files[0] ?? null)
              }}
            >
              <FolderOpen size={19} />
              <span>{file?.name ?? t.file}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
            </div>
            {progress > 0 && <progress max={100} value={progress} aria-label={`${progress}%`} />}
            <div className="header-actions">
              <button type="submit" className="button primary" disabled={!employees.length || saving}>{saving ? t.uploading : t.create}</button>
              <button type="button" className="button secondary" onClick={() => { setShowForm(false); setFile(null) }}>{t.cancel}</button>
            </div>
            {!employees.length && <span className="muted-note">{t.noEmployee}</span>}
          </form>
        )}

        <div className="document-filters">
          <label className="document-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.search} /></label>
          <select aria-label={t.employee} value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
            <option value="">{t.allEmployees}</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.firstName} {employee.lastName}</option>)}
          </select>
          <select aria-label={t.category} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">{t.allCategories}</option>{categories.map((category) => <option key={category} value={category}>{categoryText[category as keyof typeof categoryText]}</option>)}
          </select>
          <select aria-label={t.status} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">{t.allStatuses}</option>
            {['missing', 'pending', 'under_review', 'approved', 'rejected', 'expired', 'archived'].map((status) => <option key={status} value={status}>{statusText[status as keyof typeof statusText] ?? status}</option>)}
          </select>
          <select aria-label={t.expiryFilter} value={expiryFilter} onChange={(event) => setExpiryFilter(event.target.value)}>
            <option value="">{t.expiryFilter}</option><option value="soon">{t.dueSoon}</option><option value="none">{t.noExpiry}</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="uploaded-desc">{t.uploaded} ↓</option><option value="uploaded-asc">{t.uploaded} ↑</option>
            <option value="expiry-asc">{t.expiry} ↑</option><option value="name-asc">{t.name} A–Z</option>
          </select>
        </div>

        {loading ? <div className="empty-state" role="status">{t.loading}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.name}</th><th>{t.employee}</th><th>{t.category}</th><th>{t.uploaded}</th><th>{t.expiry}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead>
              <tbody>
                {sortedDocuments.length ? sortedDocuments.map((document) => {
                  const canPreview = document.hasFile && document.status !== 'archived' && ['application/pdf', 'image/jpeg', 'image/png'].includes(document.mimeType ?? '')
                  return (
                    <tr key={document.id}>
                      <td><strong>{document.name}</strong>{document.reviewComment && <small className="muted-note">{document.reviewComment}</small>}{document.workflowInstance?.status === 'pending_approval' && <small className="muted-note">{t.reviewingWorkflow}</small>}</td>
                      <td>{document.employee}</td><td>{categoryText[document.type as keyof typeof categoryText] ?? document.type}</td>
                      <td>{document.uploadedAt ? formatDate(document.uploadedAt, language) : '—'}</td>
                      <td>{document.expiryDate ? formatDate(document.expiryDate, language) : '—'}</td>
                      <td><StatusBadge status={document.status} label={statusText[document.status as keyof typeof statusText] ?? document.status} /></td>
                      <td>
                        <div className="document-actions">
                          {document.hasFile && document.status !== 'archived' && <button className="icon-button" title={t.download} disabled={busyId === document.id} onClick={() => void transfer(document)}><Download size={16} /></button>}
                          {canPreview && <button className="icon-button" title={t.preview} disabled={busyId === document.id} onClick={() => void transfer(document, true)}><Eye size={16} /></button>}
                          {canReview && document.workflowInstance?.status !== 'pending_approval' && document.hasFile && ['pending', 'under_review'].includes(document.status) && <>
                            <button className="icon-button" title={t.approved} disabled={busyId === document.id} onClick={() => review(document, 'approved')}><Check size={16} /></button>
                            <button className="icon-button" title={t.rejected} disabled={busyId === document.id} onClick={() => review(document, 'rejected')}><X size={16} /></button>
                          </>}
                          {canManage && document.status !== 'archived' && <label className="button secondary document-upload-button"><FileUp size={14} /><input type="file" disabled={busyId === document.id} accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={(event) => {
                            const selectedFile = event.currentTarget.files?.[0]
                            if (selectedFile) void runAction(document.id, async () => {
                              await apiDocumentActions.upload(document.id, selectedFile, setProgress)
                            })
                            event.currentTarget.value = ''
                          }} /></label>}
                          {canArchive && document.status !== 'archived' && <button className="icon-button" title={t.archive} disabled={busyId === document.id} onClick={() => {
                            if (window.confirm(t.confirmArchive)) void runAction(document.id, () => apiDocumentActions.archive(document.id))
                          }}><Archive size={16} /></button>}
                          {canDelete && <button className="icon-button" title={t.remove} disabled={busyId === document.id} onClick={() => {
                            if (window.confirm(t.confirmDelete)) void runAction(document.id, () => apiDocumentActions.remove(document.id))
                          }}><Trash2 size={16} /></button>}
                          {busyId === document.id && progress > 0 && <progress max={100} value={progress} aria-label={`${progress}%`} />}
                        </div>
                      </td>
                    </tr>
                  )
                }) : <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>{t.empty}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function documentFormWithFile(metadata: FormData, file: File): FormData {
  metadata.append('file', file)
  return metadata
}
