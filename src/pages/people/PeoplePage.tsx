import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Search,
} from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { getEmployees } from '../../data/employeeStore'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import type { Employee } from '../../types/models'
import { employeeRepository } from '../../data/mockRepository'
import { isApiDataMode } from '../../lib/apiClient'
import { translations } from '../../contexts/I18nContext'
import { useI18n } from '../../contexts/I18nContext'
import { useAuth } from '../../contexts/authHooks'
import { NATIONALITIES } from '../../types/models'
import { formatDate } from '../../utils/dates'

type ColumnFilter = string | { from?: string; to?: string } | { operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
type PeopleColumn = {
  id: string
  label: string
  kind: 'text' | 'date' | 'number' | 'select' | 'documentStatus'
  filterKey: string
  sortBy?: keyof Employee
  get: (employee: Employee) => string | number | null | undefined
  options?: Array<{ value: string; label: string }>
  permission?: string
}

const peopleCopy = {
  en: {
    employeeId: 'Employee ID', employee: 'Employee', job: 'Job title / position', department: 'Department', team: 'Team',
    manager: 'Reporting manager', employmentType: 'Employment type', status: 'Employment status', location: 'Work location',
    country: 'Country', hireDate: 'Hire date', workEmail: 'Work email', gender: 'Gender', nationality: 'Nationality',
    maritalStatus: 'Marital status', children: 'Children', nationalId: 'National ID', passport: 'Passport number',
    passportExpiry: 'Passport expiry', personalPhone: 'Personal phone', workPhone: 'Professional phone',
    onboarding: 'Onboarding status', offboarding: 'Offboarding status', documents: 'Document status',
    personalInfo: 'Profile completion', created: 'Created date', updated: 'Last updated',
    emergencyName: 'Emergency contact', emergencyPhone: 'Emergency phone', emergencyRelation: 'Emergency relationship',
    search: 'Search all employees', filters: 'Column filters', clear: 'Clear all', columns: 'Columns', pageSize: 'Rows per page',
    loading: 'Loading employees…', error: 'Could not load employees.', empty: 'No employees match these filters.',
    all: 'All', from: 'From', to: 'To', operator: 'Match', value: 'Value', activeFilters: 'active filters',
    fullTime: 'Full-time', partTime: 'Part-time', contractor: 'Contractor',
    active: 'Active', onLeave: 'On Leave', suspended: 'Suspended', terminated: 'Terminated',
    male: 'Male', female: 'Female', none: 'No documents', requested: 'Requested', pending: 'Pending',
    single: 'Single', married: 'Married', divorced: 'Divorced', widowed: 'Widowed',
    onTrack: 'On track', atRisk: 'At risk', completed: 'Completed', overdue: 'Overdue',
    pendingApproval: 'Pending approval', returned: 'Returned for correction', cancelled: 'Cancelled',
    approved: 'Approved', rejected: 'Rejected', expired: 'Expired', noValue: '—', previous: 'Previous page', next: 'Next page',
    archived: 'Archived',
  },
  fr: {
    employeeId: 'ID employé', employee: 'Employé', job: 'Poste / fonction', department: 'Département', team: 'Équipe',
    manager: 'Responsable hiérarchique', employmentType: 'Type de contrat', status: 'Statut professionnel', location: 'Lieu de travail',
    country: 'Pays', hireDate: 'Date d’embauche', workEmail: 'E-mail professionnel', gender: 'Genre', nationality: 'Nationalité',
    maritalStatus: 'Situation familiale', children: 'Enfants', nationalId: 'CIN', passport: 'Numéro de passeport',
    passportExpiry: 'Expiration du passeport', personalPhone: 'Téléphone personnel', workPhone: 'Téléphone professionnel',
    onboarding: 'Statut d’intégration', offboarding: 'Statut de départ', documents: 'État des documents',
    personalInfo: 'Profil complété', created: 'Date de création', updated: 'Dernière mise à jour',
    emergencyName: 'Contact d’urgence', emergencyPhone: 'Téléphone d’urgence', emergencyRelation: 'Lien du contact',
    search: 'Rechercher des employés', filters: 'Filtres par colonne', clear: 'Tout effacer', columns: 'Colonnes', pageSize: 'Lignes par page',
    loading: 'Chargement des employés…', error: 'Impossible de charger les employés.', empty: 'Aucun employé ne correspond aux filtres.',
    all: 'Tous', from: 'Du', to: 'Au', operator: 'Comparaison', value: 'Valeur', activeFilters: 'filtres actifs',
    fullTime: 'Temps plein', partTime: 'Temps partiel', contractor: 'Prestataire',
    active: 'Actif', onLeave: 'En congé', suspended: 'Suspendu', terminated: 'Terminé',
    male: 'Homme', female: 'Femme', none: 'Aucun document', requested: 'Demandé', pending: 'En attente',
    single: 'Célibataire', married: 'Marié(e)', divorced: 'Divorcé(e)', widowed: 'Veuf / veuve',
    onTrack: 'Dans les délais', atRisk: 'À risque', completed: 'Terminé', overdue: 'En retard',
    pendingApproval: 'En attente d’approbation', returned: 'À corriger', cancelled: 'Annulé',
    approved: 'Approuvé', rejected: 'Refusé', expired: 'Expiré', noValue: '—', previous: 'Page précédente', next: 'Page suivante',
    archived: 'Archivé',
  },
  ar: {
    employeeId: 'رقم الموظف', employee: 'الموظف', job: 'المسمى / المنصب', department: 'القسم', team: 'الفريق',
    manager: 'المدير المباشر', employmentType: 'نوع التوظيف', status: 'الحالة الوظيفية', location: 'موقع العمل',
    country: 'البلد', hireDate: 'تاريخ التعيين', workEmail: 'البريد المهني', gender: 'الجنس', nationality: 'الجنسية',
    maritalStatus: 'الحالة الاجتماعية', children: 'الأطفال', nationalId: 'رقم الهوية', passport: 'رقم جواز السفر',
    passportExpiry: 'انتهاء جواز السفر', personalPhone: 'الهاتف الشخصي', workPhone: 'هاتف العمل',
    onboarding: 'حالة الانضمام', offboarding: 'حالة المغادرة', documents: 'حالة المستندات',
    personalInfo: 'اكتمال الملف', created: 'تاريخ الإنشاء', updated: 'آخر تحديث',
    emergencyName: 'جهة اتصال الطوارئ', emergencyPhone: 'هاتف الطوارئ', emergencyRelation: 'صلة الطوارئ',
    search: 'البحث عن الموظفين', filters: 'تصفية الأعمدة', clear: 'مسح الكل', columns: 'الأعمدة', pageSize: 'الصفوف لكل صفحة',
    loading: 'جارٍ تحميل الموظفين…', error: 'تعذر تحميل الموظفين.', empty: 'لا يوجد موظفون مطابقون للتصفية.',
    all: 'الكل', from: 'من', to: 'إلى', operator: 'المقارنة', value: 'القيمة', activeFilters: 'عوامل تصفية نشطة',
    fullTime: 'دوام كامل', partTime: 'دوام جزئي', contractor: 'متعاقد',
    active: 'نشط', onLeave: 'في إجازة', suspended: 'موقوف', terminated: 'منتهي',
    male: 'ذكر', female: 'أنثى', none: 'لا توجد مستندات', requested: 'مطلوب', pending: 'قيد الانتظار',
    single: 'أعزب', married: 'متزوج', divorced: 'مطلق', widowed: 'أرمل',
    onTrack: 'في المسار', atRisk: 'معرّض للخطر', completed: 'مكتمل', overdue: 'متأخر',
    pendingApproval: 'بانتظار الموافقة', returned: 'مُعاد للتصحيح', cancelled: 'ملغي',
    approved: 'موافق عليه', rejected: 'مرفوض', expired: 'منتهي', noValue: '—', previous: 'الصفحة السابقة', next: 'الصفحة التالية',
    archived: 'مؤرشف',
  },
} as const

const columnPreferenceKey = 'Intillegence-people-columns-v1'

function readVisibleColumns(): string[] | null {
  try {
    const stored = localStorage.getItem(columnPreferenceKey)
    const parsed: unknown = stored ? JSON.parse(stored) : null
    return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string') ? parsed : null
  } catch (error) {
    console.warn('Could not read saved People table columns.', error)
    return null
  }
}

export function PeoplePage() {
  useEmployeeStore()
  const localEmployees = getEmployees()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const profileId = searchParams.get('employeeId')
  const { language } = useI18n()
  const t = translations[language]
  const copy = peopleCopy[language]
  const { hasPermission } = useAuth()
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState<keyof Employee>('lastName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[] | null>(() => readVisibleColumns())
  const [apiEmployees, setApiEmployees] = useState<Employee[]>([])
  const [apiTotal, setApiTotal] = useState(0)
  const [completedQuery, setCompletedQuery] = useState<string | null>(null)
  const [apiError, setApiError] = useState<{ query: string; message: string } | null>(null)
  const queryKey = JSON.stringify([page, pageSize, search, columnFilters, sortBy, sortDirection])
  const loading = isApiDataMode && completedQuery !== queryKey
  const loadError = apiError?.query === queryKey ? apiError.message : null
  const allColumns: PeopleColumn[] = [
    { id: 'id', label: copy.employeeId, kind: 'number', filterKey: 'id', sortBy: 'id', get: (employee) => employee.id },
    { id: 'employee', label: copy.employee, kind: 'text', filterKey: 'full_name', sortBy: 'firstName', get: (employee) => `${employee.firstName} ${employee.lastName}`.trim() },
    { id: 'job', label: copy.job, kind: 'text', filterKey: 'position', sortBy: 'positionTitle', get: (employee) => employee.positionTitle || employee.jobTitle },
    { id: 'department', label: copy.department, kind: 'text', filterKey: 'department', sortBy: 'department', get: (employee) => employee.department },
    { id: 'team', label: copy.team, kind: 'text', filterKey: 'team', sortBy: 'team', get: (employee) => employee.team },
    { id: 'manager', label: copy.manager, kind: 'text', filterKey: 'manager', sortBy: 'manager', get: (employee) => employee.manager },
    { id: 'employmentType', label: copy.employmentType, kind: 'select', filterKey: 'employment_type', sortBy: 'employmentType', get: (employee) => employee.employmentType, options: [
      { value: 'Full-time', label: copy.fullTime }, { value: 'Part-time', label: copy.partTime }, { value: 'Contractor', label: copy.contractor },
    ] },
    { id: 'status', label: copy.status, kind: 'select', filterKey: 'status', sortBy: 'status', get: (employee) => employee.status, options: [
      { value: 'Active', label: copy.active }, { value: 'On Leave', label: copy.onLeave }, { value: 'Suspended', label: copy.suspended }, { value: 'Terminated', label: copy.terminated },
    ] },
    { id: 'location', label: copy.location, kind: 'text', filterKey: 'location', sortBy: 'location', get: (employee) => employee.location },
    { id: 'country', label: copy.country, kind: 'text', filterKey: 'country', sortBy: 'country', get: (employee) => employee.country },
    { id: 'joined', label: copy.hireDate, kind: 'date', filterKey: 'joined_at', sortBy: 'joined', get: (employee) => employee.joined },
    { id: 'email', label: copy.workEmail, kind: 'text', filterKey: 'email', sortBy: 'email', get: (employee) => employee.email },
    { id: 'gender', label: copy.gender, kind: 'select', filterKey: 'gender', sortBy: 'gender', permission: 'people.employee.sensitive.view', get: (employee) => employee.gender, options: [
      { value: 'Male', label: copy.male }, { value: 'Female', label: copy.female },
    ] },
    { id: 'nationality', label: copy.nationality, kind: 'number', filterKey: 'nationality_id', sortBy: 'nationalityId', get: (employee) => employee.nationalityId },
    { id: 'maritalStatus', label: copy.maritalStatus, kind: 'select', filterKey: 'marital_status', sortBy: 'maritalStatus', permission: 'people.employee.family.view', get: (employee) => employee.maritalStatus, options: [
      { value: 'Single', label: copy.single }, { value: 'Married', label: copy.married },
      { value: 'Divorced', label: copy.divorced }, { value: 'Widowed', label: copy.widowed },
    ] },
    { id: 'children', label: copy.children, kind: 'number', filterKey: 'number_of_children', sortBy: 'numberOfChildren', permission: 'people.employee.family.view', get: (employee) => employee.numberOfChildren },
    { id: 'personalPhone', label: copy.personalPhone, kind: 'text', filterKey: 'personal_phone', sortBy: 'personalPhone', permission: 'people.employee.contact.view', get: (employee) => employee.personalPhone },
    { id: 'professionalPhone', label: copy.workPhone, kind: 'text', filterKey: 'professional_phone', sortBy: 'professionalPhone', permission: 'people.employee.contact.view', get: (employee) => employee.professionalPhone },
    { id: 'nationalId', label: copy.nationalId, kind: 'text', filterKey: 'national_id', sortBy: 'nationalId', permission: 'people.employee.sensitive.view', get: (employee) => employee.nationalId },
    { id: 'passport', label: copy.passport, kind: 'text', filterKey: 'passport_number', sortBy: 'passportNumber', permission: 'people.employee.sensitive.view', get: (employee) => employee.passportNumber },
    { id: 'passportExpiry', label: copy.passportExpiry, kind: 'date', filterKey: 'passport_validity_date', sortBy: 'passportValidityDate', permission: 'people.employee.sensitive.view', get: (employee) => employee.passportValidityDate },
    { id: 'onboarding', label: copy.onboarding, kind: 'select', filterKey: 'onboarding_status', sortBy: 'onboardingStatus', get: (employee) => employee.onboardingStatus, options: [
      { value: 'On track', label: copy.onTrack }, { value: 'At risk', label: copy.atRisk },
      { value: 'Completed', label: copy.completed }, { value: 'Overdue', label: copy.overdue },
      { value: 'pending_approval', label: copy.pendingApproval }, { value: 'approved', label: copy.approved },
      { value: 'rejected', label: copy.rejected }, { value: 'returned_for_correction', label: copy.returned },
      { value: 'cancelled', label: copy.cancelled },
    ] },
    { id: 'offboarding', label: copy.offboarding, kind: 'select', filterKey: 'offboarding_status', sortBy: 'offboardingStatus', get: (employee) => employee.offboardingStatus, options: [
      { value: 'On track', label: copy.onTrack }, { value: 'At risk', label: copy.atRisk },
      { value: 'Completed', label: copy.completed }, { value: 'Overdue', label: copy.overdue },
      { value: 'pending_approval', label: copy.pendingApproval }, { value: 'approved', label: copy.approved },
      { value: 'rejected', label: copy.rejected }, { value: 'returned_for_correction', label: copy.returned },
      { value: 'cancelled', label: copy.cancelled },
    ] },
    { id: 'documents', label: copy.documents, kind: 'documentStatus', filterKey: 'document_status', sortBy: 'documentStatusCounts', get: (employee) => employee.documentStatusCounts?.total ?? 0 },
    { id: 'personalInfo', label: copy.personalInfo, kind: 'date', filterKey: 'personal_info_completed_at', sortBy: 'personalInfoCompletedAt', get: (employee) => employee.personalInfoCompletedAt },
    { id: 'created', label: copy.created, kind: 'date', filterKey: 'created_at', sortBy: 'createdAt', get: (employee) => employee.createdAt },
    { id: 'updated', label: copy.updated, kind: 'date', filterKey: 'updated_at', sortBy: 'updatedAt', get: (employee) => employee.updatedAt },
    { id: 'emergencyName', label: copy.emergencyName, kind: 'text', filterKey: 'emergency_contact_name', sortBy: 'emergencyContactName', permission: 'people.employee.sensitive.view', get: (employee) => employee.emergencyContactName },
    { id: 'emergencyPhone', label: copy.emergencyPhone, kind: 'text', filterKey: 'emergency_contact_phone', sortBy: 'emergencyContactPhone', permission: 'people.employee.sensitive.view', get: (employee) => employee.emergencyContactPhone },
    { id: 'emergencyRelation', label: copy.emergencyRelation, kind: 'text', filterKey: 'emergency_contact_relationship', sortBy: 'emergencyContactRelationship', permission: 'people.employee.sensitive.view', get: (employee) => employee.emergencyContactRelationship },
  ]
  const columns = allColumns.filter((column) => !column.permission || hasPermission(column.permission))
  const shownColumns = visibleColumnIds
    ? columns.filter((column) => visibleColumnIds.includes(column.id))
    : columns
  const activeColumnFilterCount = Object.values(columnFilters).filter((value) =>
    typeof value === 'string' ? value.trim() !== '' : Object.values(value).some((part) => part !== '' && part !== undefined),
  ).length
  const activeFilterCount = activeColumnFilterCount + (search.trim() ? 1 : 0)

  useEffect(() => {
    if (visibleColumnIds) localStorage.setItem(columnPreferenceKey, JSON.stringify(visibleColumnIds))
  }, [visibleColumnIds])

  useEffect(() => {
    if (!profileId) return
    navigate(`/app/employees/${encodeURIComponent(profileId)}`, { replace: true })
  }, [navigate, profileId])

  useEffect(() => {
    if (!isApiDataMode) return

    let active = true
    employeeRepository.list({
      page,
      pageSize,
      search,
      sortBy,
      sortDirection,
      columnFilters,
    }).then((result) => {
      if (!active) return
      setApiEmployees(result.data)
      setApiTotal(result.total)
      setApiError((previous) => previous?.query === queryKey ? null : previous)
    }).catch((error: unknown) => {
      if (!active) return
      setApiEmployees([])
      setApiTotal(0)
      setApiError({
        query: queryKey,
        message: error instanceof Error ? error.message : 'Could not load employees.',
      })
    }).finally(() => {
      if (active) setCompletedQuery(queryKey)
    })

    return () => {
      active = false
    }
  }, [queryKey, page, pageSize, search, sortBy, sortDirection, columnFilters])

  const filtered = useMemo(() => {
    if (isApiDataMode) return apiEmployees
    const matches = localEmployees.filter((employee) => {
      if (search && !`${employee.firstName} ${employee.lastName} ${employee.jobTitle} ${employee.department}`.toLowerCase().includes(search.toLowerCase())) return false
      return Object.entries(columnFilters).every(([key, filter]) => {
        const column = columns.find((item) => item.filterKey === key)
        if (!column) return true
        const actual = String(column.get(employee) ?? '').toLowerCase()
        if (typeof filter === 'string') return actual.includes(filter.toLowerCase())
        if ('operator' in filter) {
          const number = Number(column.get(employee))
          return Number.isFinite(number) && ({
            eq: number === filter.value, gt: number > filter.value, gte: number >= filter.value,
            lt: number < filter.value, lte: number <= filter.value,
          }[filter.operator])
        }
        const date = String(column.get(employee) ?? '').slice(0, 10)
        return (!filter.from || date >= filter.from) && (!filter.to || date <= filter.to)
      })
    })
    if (!sortBy) return matches
    return matches.sort((a, b) => {
      const left = String(a[sortBy] ?? '').toLocaleLowerCase()
      const right = String(b[sortBy] ?? '').toLocaleLowerCase()
      return (left < right ? -1 : left > right ? 1 : 0) * (sortDirection === 'asc' ? 1 : -1)
    })
  }, [apiEmployees, localEmployees, search, columnFilters, sortBy, sortDirection, columns])

  const updateFilter = (key: string, value: ColumnFilter | null) => {
    setColumnFilters((current) => {
      const next = { ...current }
      if (value === null) delete next[key]
      else next[key] = value
      return next
    })
    setPage(1)
  }

  const renderFilter = (column: PeopleColumn) => {
    const filter = columnFilters[column.filterKey]
    if (column.kind === 'date') {
      const range = typeof filter === 'object' && filter && !('operator' in filter) ? filter : {}
      return <div className="people-date-filter">
        <input aria-label={`${column.label} ${copy.from}`} title={`${column.label} ${copy.from}`} type="date" value={range.from ?? ''} onChange={(event) => updateFilter(column.filterKey, { ...range, from: event.target.value })} />
        <input aria-label={`${column.label} ${copy.to}`} title={`${column.label} ${copy.to}`} type="date" value={range.to ?? ''} onChange={(event) => updateFilter(column.filterKey, { ...range, to: event.target.value })} />
      </div>
    }
    if (column.kind === 'number') {
      const numeric = typeof filter === 'object' && filter && 'operator' in filter ? filter : { operator: 'eq' as const, value: 0 }
      return <div className="people-number-filter">
        <select aria-label={`${column.label} ${copy.operator}`} value={numeric.operator} onChange={(event) => updateFilter(column.filterKey, { ...numeric, operator: event.target.value as typeof numeric.operator })}>
          <option value="eq">=</option><option value="gt">&gt;</option><option value="gte">≥</option><option value="lt">&lt;</option><option value="lte">≤</option>
        </select>
        <input aria-label={`${column.label} ${copy.value}`} title={column.label} type="number" min="0" value={typeof filter === 'object' && filter && 'operator' in filter ? filter.value : ''} onChange={(event) => {
          const value = event.target.value
          updateFilter(column.filterKey, value === '' ? null : { ...numeric, value: Number(value) })
        }} />
      </div>
    }
    if (column.kind === 'select' || column.kind === 'documentStatus') {
      const options = column.kind === 'documentStatus'
        ? [
            { value: 'missing', label: copy.requested }, { value: 'pending', label: copy.pending },
            { value: 'under_review', label: copy.pending }, { value: 'approved', label: copy.approved },
            { value: 'rejected', label: copy.rejected }, { value: 'expired', label: copy.expired }, { value: 'archived', label: copy.archived },
          ]
        : column.options ?? []
      return <select aria-label={`${column.label} ${copy.filters}`} value={typeof filter === 'string' ? filter : ''} onChange={(event) => updateFilter(column.filterKey, event.target.value || null)}>
        <option value="">{copy.all}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    }
    return <input aria-label={`${column.label} ${copy.filters}`} title={column.label} type="search" value={typeof filter === 'string' ? filter : ''} placeholder="…" onChange={(event) => updateFilter(column.filterKey, event.target.value || null)} />
  }

  const displayValue = (column: PeopleColumn, employee: Employee): string => {
    const raw = column.get(employee)
    if (raw === null || raw === undefined || raw === '') return copy.noValue
    if (column.id === 'id') return `EMP-${raw}`
    if (column.id === 'nationality') return NATIONALITIES[Number(raw)]?.code ?? String(raw)
    if (column.id === 'status') return String(raw)
    if (column.kind === 'date') return formatDate(String(raw).slice(0, 10), language)
    if (column.id === 'documents') {
      const counts = employee.documentStatusCounts
      if (!counts || counts.total === 0) return copy.none
      return [
        counts.approved ? `${counts.approved} ${copy.approved.toLowerCase()}` : '',
        counts.pending ? `${counts.pending} ${copy.pending.toLowerCase()}` : '',
        counts.missing ? `${counts.missing} ${copy.requested.toLowerCase()}` : '',
        counts.rejected ? `${counts.rejected} ${copy.rejected.toLowerCase()}` : '',
        counts.archived ? `${counts.archived} ${copy.archived.toLowerCase()}` : '',
        counts.expired ? `${counts.expired} ${copy.expired.toLowerCase()}` : '',
      ].filter(Boolean).join(' · ')
    }
    if (column.id === 'onboarding' && employee.onboardingApprovalStatus) return `${raw} · ${employee.onboardingApprovalStatus}`
    if (column.id === 'offboarding' && employee.offboardingApprovalStatus) return `${raw} · ${employee.offboardingApprovalStatus}`
    return String(raw)
  }

  const openEmployee = (employee: Employee) => navigate(`/app/employees/${employee.id}`)

  const toggleSort = (column: PeopleColumn) => {
    if (!column.sortBy) return
    if (sortBy === column.sortBy) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortBy(column.sortBy)
      setSortDirection('asc')
    }
    setPage(1)
  }

  const pageCount = isApiDataMode ? Math.max(1, Math.ceil(apiTotal / pageSize)) : 1
  const matchingCount = isApiDataMode ? apiTotal : filtered.length

  return (
    <div className="page">
      <Breadcrumb
        items={[
          { label: t.people },
        ]}
      />

      <PageHeader
        eyebrow={isApiDataMode ? `PEOPLE · ${apiTotal} EMPLOYEES` : `PEOPLE · ${localEmployees.length} EMPLOYEES`}
        title={t.directory}
        subtitle="A single source of truth for your workforce."
      />

      <div className="directory-summary">
        <div><span>{language === 'fr' ? 'Correspondances' : language === 'ar' ? 'المطابقون' : 'Matching employees'}</span><strong>{matchingCount}</strong><small>{language === 'fr' ? 'Périmètre autorisé' : language === 'ar' ? 'ضمن نطاق الصلاحية' : 'Within your authorized scope'}</small></div>
        <div><span>{language === 'fr' ? 'Sur cette page' : language === 'ar' ? 'في هذه الصفحة' : 'Shown on this page'}</span><strong>{filtered.length}</strong><small>{language === 'fr' ? `Page ${page}` : language === 'ar' ? `الصفحة ${page}` : `Page ${page}`}</small></div>
        <div><span>{copy.filters}</span><strong>{activeFilterCount}</strong><small>{activeFilterCount ? copy.activeFilters : copy.all}</small></div>
      </div>

      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <div className="table-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder={copy.search}
            />
          </div>
          <div className="people-toolbar-actions">
            {activeFilterCount > 0 && <button className="button secondary people-clear-filters" onClick={() => { setSearch(''); setColumnFilters({}); setPage(1) }}>{copy.clear}<span>{activeFilterCount}</span></button>}
            <details className="people-column-picker">
              <summary className="button secondary"><Columns3 size={15} />{copy.columns}</summary>
              <div className="people-column-options">
                <button type="button" className="people-show-all" onClick={() => setVisibleColumnIds(columns.map((column) => column.id))}>{copy.all}</button>
                {columns.map((column) => <label key={column.id}>
                  <input type="checkbox" checked={!visibleColumnIds || visibleColumnIds.includes(column.id)} disabled={Boolean(visibleColumnIds && visibleColumnIds.length === 1 && visibleColumnIds.includes(column.id))} onChange={(event) => {
                    const selectedIds = visibleColumnIds ?? columns.map((item) => item.id)
                    setVisibleColumnIds(event.target.checked ? [...selectedIds, column.id] : selectedIds.filter((id) => id !== column.id))
                  }} />
                  <span>{column.label}</span>
                </label>)}
              </div>
            </details>
          </div>
        </div>

        <div className="table-wrap">
          <table className="people-data-table">
            <thead>
              <tr>
                {shownColumns.map((column) => <th key={column.id} aria-sort={sortBy === column.sortBy ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {column.sortBy ? <button className="people-sort" onClick={() => toggleSort(column)} title={column.label}>
                    <span>{column.label}</span>{sortBy === column.sortBy ? (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} />}
                  </button> : <span title={column.label}>{column.label}</span>}
                </th>)}
              </tr>
              <tr className="people-filter-row">{shownColumns.map((column) => {
                const active = columnFilters[column.filterKey]
                const hasValue = typeof active === 'string'
                  ? active.trim() !== ''
                  : active ? Object.values(active).some((part) => part !== '' && part !== undefined) : false
                return <th key={column.id} className={hasValue ? 'people-filter-active' : undefined}>{renderFilter(column)}</th>
              })}</tr>
            </thead>
            <tbody>
              {isApiDataMode && loading ? (
                <tr><td colSpan={shownColumns.length} className="people-state-cell" role="status">{copy.loading}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={shownColumns.length} className="people-state-cell" role="alert">{copy.error} {loadError}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={shownColumns.length} className="people-state-cell">{copy.empty}</td></tr>
              ) : filtered.map((employee) => (
                <tr key={employee.id} onClick={() => openEmployee(employee)} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEmployee(employee) }
                }} tabIndex={0} className="people-employee-row">
                  {shownColumns.map((column) => {
                    const value = displayValue(column, employee)
                    return <td key={column.id} title={value} className={column.kind === 'number' ? 'people-number-cell' : undefined}>
                      {column.id === 'employee' ? <div className="employee-cell">
                        <div className="avatar employee-avatar">{employee.initials}</div>
                        <div><strong>{value}</strong><span>{employee.jobTitle}</span></div>
                      </div> : column.id === 'status' ? <StatusBadge status={employee.status} label={language === 'fr'
                        ? ({ Active: copy.active, 'On Leave': copy.onLeave, Suspended: copy.suspended, Terminated: copy.terminated } as Record<string, string>)[employee.status] ?? employee.status
                        : language === 'ar'
                          ? ({ Active: copy.active, 'On Leave': copy.onLeave, Suspended: copy.suspended, Terminated: copy.terminated } as Record<string, string>)[employee.status] ?? employee.status
                          : employee.status} /> : <span className="people-truncate">{value}</span>}
                    </td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <span>{isApiDataMode ? `${filtered.length} / ${apiTotal}` : `${filtered.length} / ${localEmployees.length}`}</span>
          {isApiDataMode && <label className="people-page-size">{copy.pageSize}
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>}
          <span className="people-pagination">
            {page} / {pageCount}
            <button className="icon-button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label={copy.previous}>
              <ChevronLeft size={15} />
            </button>
            <button className="icon-button" disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} aria-label={copy.next}>
              <ChevronRight size={15} />
            </button>
          </span>
        </div>
      </section>

    </div>
  )
}
