import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Network, Search, UserRound } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { apiRequest, isApiDataMode } from '../../lib/apiClient'
import { employeeDashboardTranslations } from './translations'
import type { EmployeeCopy } from './translations'
import './EmployeeOrganigramPage.css'

interface OrgChartNode {
  employeeId: number
  name: string
  jobTitle: string | null
  departmentId: string | null
  department: string | null
  teamId: string | null
  team: string | null
  positionId: string | null
  position: string | null
  status: string
  children: OrgChartNode[]
}

interface OrgChartResponse {
  data: OrgChartNode[]
  meta: { cycleDetected: boolean }
}

interface EmployeeSummaryResponse {
  employee: {
    id: number
    firstName: string
    lastName: string
    jobTitle: string
    department: string | null
    team: string | null
    position: string | null
    managerId: number | null
    manager: string | null
    status: string
  }
}

function flatten(nodes: OrgChartNode[]): OrgChartNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

function findPath(nodes: OrgChartNode[], employeeId: number): OrgChartNode[] | null {
  for (const node of nodes) {
    if (node.employeeId === employeeId) return [node]
    const childPath = findPath(node.children, employeeId)
    if (childPath) return [node, ...childPath]
  }
  return null
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toLocaleUpperCase()
}

export function EmployeeOrganigramPage() {
  const { currentUser } = useAuth()
  const { language } = useI18n()
  const employeeId = currentUser?.employeeId
  const t = employeeDashboardTranslations[language]
  const [nodes, setNodes] = useState<OrgChartNode[]>([])
  const [employee, setEmployee] = useState<EmployeeSummaryResponse['employee'] | null>(null)
  const [search, setSearch] = useState('')
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(isApiDataMode)
  const [error, setError] = useState('')
  const [cycleDetected, setCycleDetected] = useState(false)
  const [reload, setReload] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [chart, summary] = await Promise.all([
        apiRequest<OrgChartResponse>('/api/v1/org-chart'),
        apiRequest<EmployeeSummaryResponse>('/api/v1/employees/summary'),
      ])
      setNodes(chart.data)
      setCycleDetected(chart.meta.cycleDetected)
      setEmployee(summary.employee)
      const currentEmployeeId = employeeId ?? summary.employee.id
      setFocusedId(findPath(chart.data, currentEmployeeId) ? currentEmployeeId : chart.data[0]?.employeeId ?? null)
    } catch (cause) {
      setNodes([])
      setEmployee(null)
      setError(cause instanceof Error ? cause.message : t.orgLoadFailed)
    } finally {
      setLoading(false)
    }
  }, [employeeId, t.orgLoadFailed])

  useEffect(() => {
    if (isApiDataMode) void load()
  }, [load, reload])

  const allEmployees = useMemo(() => flatten(nodes), [nodes])
  const query = search.trim().toLocaleLowerCase()
  const matches = useMemo(
    () => query
      ? allEmployees.filter((node) =>
        `${node.name} ${node.jobTitle ?? ''} ${node.department ?? ''} ${node.team ?? ''}`
          .toLocaleLowerCase()
          .includes(query))
      : [],
    [allEmployees, query],
  )
  const path = useMemo(
    () => focusedId === null ? null : findPath(nodes, focusedId),
    [focusedId, nodes],
  )
  const focused = path?.[path.length - 1] ?? null
  const managerIsVisible = employee?.managerId !== null
    && employee?.managerId !== undefined
    && allEmployees.some((node) => node.employeeId === employee.managerId)

  if (!isApiDataMode) {
    return <div className="page"><div className="org-message" role="status">{t.orgApiRequired}</div></div>
  }

  return (
    <div className="page employee-page employee-organigram">
      <PageHeader eyebrow={t.employeePortal} title={t.organigramTitle} subtitle={t.organigramSubtitle}>
        <label className="employee-org-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.searchEmployees}
            aria-label={t.searchEmployees}
          />
        </label>
      </PageHeader>

      {cycleDetected && <div className="employee-org-alert" role="status">{t.orgCycleDetected}</div>}
      {error && (
        <div className="employee-org-alert error" role="alert">
          <span>{error}</span>
          <button type="button" className="button secondary" onClick={() => setReload((value) => value + 1)}>{t.tryAgain}</button>
        </div>
      )}

      {loading ? (
        <div className="employee-org-state" role="status">{t.orgLoading}</div>
      ) : !error && (
        <section className="employee-org-panel" aria-label={t.organigramTitle}>
          <header className="employee-org-panel-heading">
            <div className="employee-org-count"><Network size={17} /><strong>{allEmployees.length}</strong><span>{t.orgPeopleInScope}</span></div>
            <span className="employee-org-scope">{t.orgScopeNotice}</span>
          </header>

          {query ? (
            <div className="employee-org-results" role="list" aria-label={t.searchEmployees}>
              {matches.length ? matches.map((node) => (
                <button type="button" className="employee-org-result" key={node.employeeId} onClick={() => { setFocusedId(node.employeeId); setSearch('') }}>
                  <PersonCard node={node} text={t} compact />
                </button>
              )) : <div className="employee-org-state">{t.orgNoSearchResults}</div>}
            </div>
          ) : !focused ? (
            employee ? (
              <div className="employee-org-state">
                <UserRound size={20} />
                <strong>{`${employee.firstName} ${employee.lastName}`}</strong>
                <span>{t.orgNoRelationships}</span>
              </div>
            ) : <div className="employee-org-state">{t.orgNoRelationships}</div>
          ) : (
            <div className="employee-org-hierarchy">
              {employee?.manager && !managerIsVisible && focused.employeeId === employee.id && (
                <div className="employee-org-external-manager">
                  <PersonCard
                    node={{
                      employeeId: employee.managerId ?? -1,
                      name: employee.manager,
                      jobTitle: null,
                      departmentId: null,
                      department: null,
                      teamId: null,
                      team: null,
                      positionId: null,
                      position: null,
                      status: '',
                      children: [],
                    }}
                    text={t}
                    manager
                  />
                  <span>{t.orgManagerOutsideScope}</span>
                </div>
              )}
              {employee && !employee.manager && !managerIsVisible && focused.employeeId === employee.id && (
                <div className="employee-org-no-manager">{t.orgNoManager}</div>
              )}

              {path && path.length > 1 && (
                <nav className="employee-org-breadcrumb" aria-label={t.orgHierarchy}>
                  {path.slice(0, -1).map((ancestor) => (
                    <button type="button" key={ancestor.employeeId} onClick={() => setFocusedId(ancestor.employeeId)}>
                      <ArrowUp size={13} />{ancestor.name}
                    </button>
                  ))}
                </nav>
              )}

              <div className="employee-org-focus">
                <PersonCard node={focused} text={t} current />
                {focused.children.length > 0 && (
                  <>
                    <div className="employee-org-connector" aria-hidden="true"><ArrowDown size={16} /></div>
                    <div className="employee-org-reports">
                      {focused.children.map((child) => (
                        <button type="button" className="employee-org-child" key={child.employeeId} onClick={() => setFocusedId(child.employeeId)}>
                          <PersonCard node={child} text={t} compact />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function PersonCard({
  node,
  text,
  current = false,
  compact = false,
  manager = false,
}: {
  node: OrgChartNode
  text: EmployeeCopy
  current?: boolean
  compact?: boolean
  manager?: boolean
}) {
  return (
    <span className={`employee-org-person ${current ? 'current' : ''} ${compact ? 'compact' : ''} ${manager ? 'manager' : ''}`}>
      <span className="employee-org-avatar" aria-hidden="true">{initials(node.name)}</span>
      <span className="employee-org-copy">
        <strong>{node.name}</strong>
        <span>{node.jobTitle || text.orgTitleMissing}</span>
        <small>{[node.department, node.team].filter(Boolean).join(' · ') || text.orgDepartmentMissing}</small>
        {node.position && <small>{node.position}</small>}
      </span>
      {!manager && node.status && <span className="employee-org-status">{employeeStatusLabel(node.status, text)}</span>}
      {manager && <span className="employee-org-manager-label">{text.manager}</span>}
    </span>
  )
}

function employeeStatusLabel(status: string, text: EmployeeCopy): string {
  const labels: Record<string, keyof EmployeeCopy> = {
    Active: 'employeeStatusActive',
    'On Leave': 'employeeStatusOnLeave',
    Suspended: 'employeeStatusSuspended',
    Terminated: 'employeeStatusTerminated',
  }
  const key = labels[status]
  return key ? text[key] : status
}
