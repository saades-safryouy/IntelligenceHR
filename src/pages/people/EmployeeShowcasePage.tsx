import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, BriefcaseBusiness, Building2, CalendarDays, MapPin, UserRound } from 'lucide-react'
import { Breadcrumb } from '../../components/common/Breadcrumb'
import { PageHeader } from '../../components/common/PageHeader'
import { StatusBadge } from '../../components/employees/StatusBadge'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { employeeRepository } from '../../data/mockRepository'
import { useEmployeeStore } from '../../hooks/useEmployeeStore'
import { NATIONALITIES, type Employee } from '../../types/models'
import { formatDate } from '../../utils/dates'

const showcaseCopy = {
  en: {
    people: 'People', title: 'Employee profile', subtitle: 'A complete view of this employee record.',
    loading: 'Loading employee profile…', unavailable: 'This employee profile is unavailable with your current permissions.',
    tryAgain: 'Try again', back: 'Back to people', employeeId: 'Employee ID',
    employment: 'Employment', contact: 'Contact information', personal: 'Personal information', status: 'Employment status',
    jobTitle: 'Job title', department: 'Department', team: 'Team', manager: 'Reporting manager', type: 'Employment type',
    location: 'Work location', country: 'Country', joined: 'Hire date', workEmail: 'Work email',
    workPhone: 'Professional phone', personalPhone: 'Personal phone', gender: 'Gender', nationality: 'Nationality',
    maritalStatus: 'Marital status', children: 'Children', nationalId: 'National ID',
    passport: 'Passport number', passportExpiry: 'Passport expiry', emergencyName: 'Emergency contact',
    emergencyPhone: 'Emergency phone', emergencyRelation: 'Relationship', onboarding: 'Onboarding',
    offboarding: 'Offboarding', documents: 'Documents', noValue: 'Not provided', restricted: 'Restricted',
  },
  fr: {
    people: 'Personnel', title: 'Profil de l’employé', subtitle: 'Vue complète du dossier de cet employé.',
    loading: 'Chargement du profil…', unavailable: 'Ce profil est indisponible avec vos autorisations actuelles.',
    tryAgain: 'Réessayer', back: 'Retour au personnel', employeeId: 'ID employé',
    employment: 'Emploi', contact: 'Coordonnées', personal: 'Informations personnelles', status: 'Statut professionnel',
    jobTitle: 'Poste', department: 'Département', team: 'Équipe', manager: 'Responsable hiérarchique', type: 'Type de contrat',
    location: 'Lieu de travail', country: 'Pays', joined: 'Date d’embauche', workEmail: 'E-mail professionnel',
    workPhone: 'Téléphone professionnel', personalPhone: 'Téléphone personnel', gender: 'Genre', nationality: 'Nationalité',
    maritalStatus: 'Situation familiale', children: 'Enfants', nationalId: 'CIN',
    passport: 'Numéro de passeport', passportExpiry: 'Expiration du passeport', emergencyName: 'Contact d’urgence',
    emergencyPhone: 'Téléphone d’urgence', emergencyRelation: 'Lien', onboarding: 'Intégration',
    offboarding: 'Départ', documents: 'Documents', noValue: 'Non renseigné', restricted: 'Restreint',
  },
  ar: {
    people: 'الموظفون', title: 'ملف الموظف', subtitle: 'عرض شامل لسجل الموظف.',
    loading: 'جارٍ تحميل ملف الموظف…', unavailable: 'ملف الموظف غير متاح ضمن صلاحياتك الحالية.',
    tryAgain: 'إعادة المحاولة', back: 'العودة إلى الموظفين', employeeId: 'رقم الموظف',
    employment: 'العمل', contact: 'معلومات الاتصال', personal: 'المعلومات الشخصية', status: 'الحالة الوظيفية',
    jobTitle: 'المسمى الوظيفي', department: 'القسم', team: 'الفريق', manager: 'المدير المباشر', type: 'نوع التوظيف',
    location: 'موقع العمل', country: 'البلد', joined: 'تاريخ التعيين', workEmail: 'البريد المهني',
    workPhone: 'هاتف العمل', personalPhone: 'الهاتف الشخصي', gender: 'الجنس', nationality: 'الجنسية',
    maritalStatus: 'الحالة الاجتماعية', children: 'الأطفال', nationalId: 'رقم الهوية',
    passport: 'رقم جواز السفر', passportExpiry: 'انتهاء جواز السفر', emergencyName: 'جهة اتصال الطوارئ',
    emergencyPhone: 'هاتف الطوارئ', emergencyRelation: 'صلة القرابة', onboarding: 'الانضمام',
    offboarding: 'المغادرة', documents: 'المستندات', noValue: 'غير متوفر', restricted: 'مقيّد',
  },
} as const

type ShowcaseLabel = keyof typeof showcaseCopy.en
type ProfileField = { label: ShowcaseLabel; value: string | number | null | undefined; permission?: string }

function ProfileSection({ title, fields, empty, labels }: {
  title: string
  fields: ProfileField[]
  empty: string
  labels: Record<ShowcaseLabel, string>
}) {
  return (
    <section className="panel employee-showcase-section">
      <h2>{title}</h2>
      <dl>
        {fields.map((field) => (
          <div className="employee-showcase-field" key={field.label}>
            <dt>{labels[field.label]}</dt>
            <dd>{field.value === null || field.value === undefined || field.value === '' ? empty : field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function EmployeeShowcasePage() {
  useEmployeeStore()
  const { employeeId = '' } = useParams()
  const { pathname } = useLocation()
  const managerPortal = pathname.startsWith('/manager/')
  const peoplePath = managerPortal ? '/manager/team' : '/app/employees'
  const { hasPermission } = useAuth()
  const { language } = useI18n()
  const copy = showcaseCopy[language]
  const [result, setResult] = useState<{
    employeeId: number
    reload: number
    employee: Employee | null
    error: string
  } | null>(null)
  const [reload, setReload] = useState(0)
  const id = Number(employeeId)
  const validId = Number.isSafeInteger(id) && id > 0
  const hasCurrentResult = result?.employeeId === id && result.reload === reload
  const loading = validId && !hasCurrentResult
  const employee = hasCurrentResult ? result.employee : null
  const error = hasCurrentResult ? result.error : ''

  useEffect(() => {
    if (!validId) return

    let active = true
    employeeRepository.get(id)
      .then((record) => {
        if (!active) return
        setResult({
          employeeId: id,
          reload,
          employee: record,
          error: record ? '' : copy.unavailable,
        })
      })
      .catch(() => {
        if (active) setResult({ employeeId: id, reload, employee: null, error: copy.unavailable })
      })

    return () => { active = false }
  }, [copy.unavailable, id, reload, validId])

  if (!validId) {
    return (
      <div className="page">
        <Breadcrumb items={[{ label: copy.people, path: peoplePath }, { label: copy.title }]} />
        <div className="employee-showcase-message" role="alert">
          <p>{copy.unavailable}</p>
          <Link to={peoplePath} className="button secondary"><ArrowLeft size={16} />{copy.back}</Link>
        </div>
      </div>
    )
  }
  if (loading) return <div className="page"><div className="empty-block" role="status">{copy.loading}</div></div>

  if (!employee) {
    return (
      <div className="page">
        <Breadcrumb items={[{ label: copy.people, path: peoplePath }, { label: copy.title }]} />
        <div className="employee-showcase-message" role="alert">
          <p>{error || copy.unavailable}</p>
          <div>
            <Link to={peoplePath} className="button secondary"><ArrowLeft size={16} />{copy.back}</Link>
            <button type="button" className="button primary" onClick={() => setReload((value) => value + 1)}>{copy.tryAgain}</button>
          </div>
        </div>
      </div>
    )
  }

  const fullName = `${employee.firstName} ${employee.lastName}`.trim()
  const protectedValue = (
    value: ProfileField['value'],
    permission: string,
  ): ProfileField['value'] => hasPermission(permission) ? value : copy.restricted
  const nationality = employee.nationalityId === null
    ? null
    : NATIONALITIES[employee.nationalityId]?.code ?? employee.nationalityId
  const personalFields: ProfileField[] = [
    { label: 'gender', value: protectedValue(employee.gender, 'people.employee.sensitive.view') },
    { label: 'nationality', value: nationality },
    { label: 'maritalStatus', value: protectedValue(employee.maritalStatus, 'people.employee.family.view') },
    { label: 'children', value: protectedValue(employee.numberOfChildren, 'people.employee.family.view') },
    { label: 'nationalId', value: protectedValue(employee.nationalId, 'people.employee.sensitive.view') },
    { label: 'passport', value: protectedValue(employee.passportNumber, 'people.employee.sensitive.view') },
    { label: 'passportExpiry', value: protectedValue(
      employee.passportValidityDate ? formatDate(employee.passportValidityDate, language) : null,
      'people.employee.sensitive.view',
    ) },
  ]
  const contactFields: ProfileField[] = [
    { label: 'workEmail', value: employee.email },
    { label: 'workPhone', value: protectedValue(employee.professionalPhone, 'people.employee.contact.view') },
    { label: 'personalPhone', value: protectedValue(employee.personalPhone, 'people.employee.contact.view') },
    { label: 'emergencyName', value: protectedValue(employee.emergencyContactName, 'people.employee.sensitive.view') },
    { label: 'emergencyPhone', value: protectedValue(employee.emergencyContactPhone, 'people.employee.sensitive.view') },
    { label: 'emergencyRelation', value: protectedValue(employee.emergencyContactRelationship, 'people.employee.sensitive.view') },
  ]

  return (
    <div className="page employee-showcase-page">
      <Breadcrumb items={[{ label: copy.people, path: peoplePath }, { label: fullName }]} />
      <PageHeader eyebrow={`${copy.employeeId} · EMP-${employee.id}`} title={copy.title} subtitle={copy.subtitle}>
        <Link to={peoplePath} className="button secondary"><ArrowLeft size={16} />{copy.back}</Link>
      </PageHeader>

      <section className="employee-showcase-hero">
        <div className="employee-showcase-identity">
          <div className="avatar employee-showcase-avatar">{employee.initials}</div>
          <div>
            <span className="employee-showcase-kicker"><UserRound size={14} />{copy.employeeId} · EMP-{employee.id}</span>
            <h2>{fullName}</h2>
            <p>{employee.positionTitle || employee.jobTitle}</p>
            <StatusBadge status={employee.status} />
          </div>
        </div>
        <div className="employee-showcase-highlights">
          <div><BriefcaseBusiness size={17} /><span>{copy.department}</span><strong>{employee.department || copy.noValue}</strong></div>
          <div><Building2 size={17} /><span>{copy.manager}</span><strong>{employee.manager || copy.noValue}</strong></div>
          <div><MapPin size={17} /><span>{copy.location}</span><strong>{employee.location || copy.noValue}</strong></div>
          <div><CalendarDays size={17} /><span>{copy.joined}</span><strong>{employee.joined ? formatDate(employee.joined, language) : copy.noValue}</strong></div>
        </div>
      </section>

      <div className="employee-showcase-grid">
        <ProfileSection title={copy.employment} empty={copy.noValue} fields={[
          { label: 'jobTitle', value: employee.positionTitle || employee.jobTitle },
          { label: 'department', value: employee.department },
          { label: 'team', value: employee.team },
          { label: 'manager', value: employee.manager },
          { label: 'type', value: employee.employmentType },
          { label: 'status', value: employee.status },
          { label: 'location', value: employee.location },
          { label: 'country', value: employee.country },
          { label: 'joined', value: employee.joined ? formatDate(employee.joined, language) : null },
          { label: 'onboarding', value: employee.onboardingStatus },
          { label: 'offboarding', value: employee.offboardingStatus },
          { label: 'documents', value: employee.documentStatusCounts?.total },
        ]} labels={copy} />
        <ProfileSection title={copy.contact} empty={copy.noValue} fields={contactFields} labels={copy} />
        <ProfileSection title={copy.personal} empty={copy.noValue} fields={personalFields} labels={copy} />
      </div>
    </div>
  )
}
