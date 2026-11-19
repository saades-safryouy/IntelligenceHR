import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { isApiDataMode } from '../../lib/apiClient'
import { employeeDashboardTranslations } from './translations'
import { EmployeeDocumentsPanel } from './EmployeeDocumentsPanel'

export function EmployeeDocumentsPage() {
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const t = employeeDashboardTranslations[language]

  return (
    <div className="page employee-page">
      <PageHeader eyebrow={t.employeePortal} title={t.documentsTitle} subtitle={t.documentsSubtitle} />
      {isApiDataMode
        ? <EmployeeDocumentsPanel employeeId={currentUser?.employeeId ?? undefined} />
        : <section className="panel"><div className="empty-state" role="status">{t.noDocuments}</div></section>}
    </div>
  )
}
