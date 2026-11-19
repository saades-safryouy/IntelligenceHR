import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, PointerEvent, ReactElement } from 'react'
import {
  ChevronDown,
  ChevronRight,
  LocateFixed,
  Minus,
  Plus,
  Search,
  UserRoundCog,
  UsersRound,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { useI18n } from '../../contexts/I18nContext'
import { ApiError, apiData, apiRequest, isApiDataMode } from '../../lib/apiClient'
import './OrganigrammePage.css'

interface OrgChartNode {
  employeeId: number
  name: string
  jobTitle: string | null
  departmentId: string | null
  department: string | null
  positionId: string | null
  position: string | null
  status: string
  children: OrgChartNode[]
}

interface OrgChartResponse {
  data: OrgChartNode[]
  meta: { cycleDetected: boolean }
}

interface ChartView {
  scale: number
  x: number
  y: number
}

function flatten(nodes: OrgChartNode[]): OrgChartNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

function today(): string {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export function OrganigrammePage() {
  const { text } = useI18n()
  const { hasPermission } = useAuth()
  const navigate = useNavigate()
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null)
  const [nodes, setNodes] = useState<OrgChartNode[]>([])
  const [loading, setLoading] = useState(isApiDataMode)
  const [loadError, setLoadError] = useState('')
  const [cycleDetected, setCycleDetected] = useState(false)
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  const [view, setView] = useState<ChartView>({ scale: 1, x: 0, y: 0 })
  const [editing, setEditing] = useState<OrgChartNode | null>(null)
  const [managerId, setManagerId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [saved, setSaved] = useState(false)

  const loadChart = useCallback(async () => {
    try {
      const response = await apiRequest<OrgChartResponse>('/api/v1/org-chart')
      setNodes(response.data)
      setCycleDetected(response.meta.cycleDetected)
      setCollapsed(new Set())
      setLoadError('')
    } catch (error) {
      setNodes([])
      setLoadError(error instanceof ApiError && error.status === 403
        ? text('You do not have permission to view this organization chart.')
        : error instanceof Error ? error.message : text('Could not load the organization chart.'))
    } finally {
      setLoading(false)
    }
  }, [text])

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    apiRequest<OrgChartResponse>('/api/v1/org-chart')
      .then((response) => {
        if (!active) return
        setNodes(response.data)
        setCycleDetected(response.meta.cycleDetected)
        setCollapsed(new Set())
        setLoadError('')
      })
      .catch((error: unknown) => {
        if (!active) return
        setNodes([])
        setLoadError(error instanceof ApiError && error.status === 403
          ? text('You do not have permission to view this organization chart.')
          : error instanceof Error ? error.message : text('Could not load the organization chart.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [text])

  const allEmployees = useMemo(() => flatten(nodes), [nodes])
  const departments = useMemo(() => {
    const values = new Map<string, string>()
    for (const employee of allEmployees) {
      if (employee.departmentId && employee.department) values.set(employee.departmentId, employee.department)
    }
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [allEmployees])

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const filter = (items: OrgChartNode[]): OrgChartNode[] =>
      items.flatMap((node) => {
        const children = filter(node.children)
        const matchesText = !query || `${node.name} ${node.jobTitle ?? ''} ${node.department ?? ''}`.toLocaleLowerCase().includes(query)
        const matchesDepartment = !departmentId || node.departmentId === departmentId
        if (!query && !departmentId) return [{ ...node, children }]
        return matchesText && matchesDepartment || children.length > 0
          ? [{ ...node, children }]
          : []
      })
    return filter(nodes)
  }, [nodes, search, departmentId])

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const width = content.offsetWidth
    const height = content.offsetHeight
    if (!width || !height) {
      setView({ scale: 1, x: 0, y: 0 })
      return
    }
    const scale = Math.min(1, (viewport.clientWidth - 48) / width, (viewport.clientHeight - 48) / height)
    setView({
      scale: Math.max(0.35, scale),
      x: (viewport.clientWidth - width * Math.max(0.35, scale)) / 2,
      y: 24,
    })
  }, [])

  const updateManager = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing || saving) return
    setSaving(true)
    setLoading(true)
    setActionError('')
    try {
      await apiData(`/api/v1/employees/${editing.employeeId}/reporting-relationships`, {
        method: 'PUT',
        body: JSON.stringify({
          managerEmployeeId: managerId ? Number(managerId) : null,
          effectiveFrom,
        }),
      })
      setEditing(null)
      setSaved(true)
      await loadChart()
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 403
        ? text('You do not have permission to change reporting lines.')
        : error instanceof Error ? error.message : text('Could not update the reporting relationship.'))
    } finally {
      setSaving(false)
    }
  }

  const toggleCollapsed = (employeeId: number) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(employeeId)) next.delete(employeeId)
      else next.add(employeeId)
      return next
    })
  }

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select')) return
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: view.x,
      startY: view.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pan = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView((previous) => ({
      ...previous,
      x: drag.startX + event.clientX - drag.x,
      y: drag.startY + event.clientY - drag.y,
    }))
  }

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const openManagerEditor = (employee: OrgChartNode) => {
    setEditing(employee)
    setManagerId(String(findManagerId(nodes, employee.employeeId) ?? ''))
    setEffectiveFrom(today())
    setActionError('')
    setSaved(false)
  }

  const renderNode = (employee: OrgChartNode): ReactElement => {
    const hasChildren = employee.children.length > 0
    const isCollapsed = collapsed.has(employee.employeeId)
    const isFiltered = Boolean(search.trim() || departmentId)
    const children = isCollapsed && !isFiltered ? [] : employee.children
    const initials = employee.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toLocaleUpperCase()
    return (
      <div className="org-tree-node" key={employee.employeeId}>
        <article className="org-person-card">
          <button
            type="button"
            className="org-person-main"
            onClick={() => navigate(`/app/employees/${employee.employeeId}`)}
            aria-label={`${text('Open employee profile')}: ${employee.name}`}
          >
            <span className="org-avatar" aria-hidden="true">{initials}</span>
            <span className="org-person-copy">
              <strong>{employee.name}</strong>
              <span>{employee.jobTitle || text('Title not specified')}</span>
              <small>{employee.department || text('Department not specified')}</small>
            </span>
          </button>
          <div className="org-card-footer">
            <span className={`org-status ${employee.status.toLowerCase().replaceAll(' ', '-')}`}>{text(employee.status)}</span>
            {hasPermission('people.reporting.update') && (
              <button
                type="button"
                className="org-icon-action"
                onClick={() => openManagerEditor(employee)}
                aria-label={`${text('Change manager for')} ${employee.name}`}
                title={text('Change manager')}
              >
                <UserRoundCog size={15} />
              </button>
            )}
            {hasChildren && (
              <button
                type="button"
                className="org-expand-button"
                onClick={() => toggleCollapsed(employee.employeeId)}
                aria-expanded={!isCollapsed || isFiltered}
                aria-label={`${isCollapsed ? text('Expand') : text('Collapse')} ${employee.name}`}
                title={isCollapsed ? text('Expand') : text('Collapse')}
              >
                {isCollapsed && !isFiltered ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <span>{employee.children.length}</span>
              </button>
            )}
          </div>
        </article>
        {children.length > 0 && <div className="org-tree-children">{children.map(renderNode)}</div>}
      </div>
    )
  }

  if (!isApiDataMode) {
    return <div className="page"><div className="org-message" role="status">{text('Organization chart requires API mode.')}</div></div>
  }

  return (
    <div className="page org-page">
      <PageHeader
        eyebrow={text('PEOPLE · ORGANIZATION')}
        title={text('Organigramme')}
        subtitle={text('Explore reporting lines and manage the organization’s reporting structure.')}
      >
        <div className="org-toolbar">
          <label className="org-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text('Search employees')} />
            {search && <button type="button" onClick={() => setSearch('')} aria-label={text('Clear search')}><X size={14} /></button>}
          </label>
          <select aria-label={text('Filter by department')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">{text('All departments')}</option>
            {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </PageHeader>

      {saved && <div className="org-banner success" role="status">{text('Reporting relationship updated.')}</div>}
      {cycleDetected && <div className="org-banner warning" role="status">{text('A reporting cycle was detected. Isolated employees are shown as separate roots.')}</div>}

      <section className="org-chart-panel">
        <header className="org-chart-heading">
          <div className="org-count"><UsersRound size={17} /><strong>{filteredNodes.length ? flatten(filteredNodes).length : 0}</strong><span>{text('employees shown')}</span></div>
          <div className="org-chart-controls" aria-label={text('Chart controls')}>
            <button type="button" className="icon-button" onClick={() => setView((value) => ({ ...value, scale: Math.max(0.35, value.scale - 0.1) }))} aria-label={text('Zoom out')} title={text('Zoom out')}><Minus size={16} /></button>
            <span>{Math.round(view.scale * 100)}%</span>
            <button type="button" className="icon-button" onClick={() => setView((value) => ({ ...value, scale: Math.min(1.5, value.scale + 0.1) }))} aria-label={text('Zoom in')} title={text('Zoom in')}><Plus size={16} /></button>
            <button type="button" className="icon-button" onClick={fitToScreen} aria-label={text('Fit to screen')} title={text('Fit to screen')}><LocateFixed size={16} /></button>
            <button type="button" className="icon-button" onClick={() => setCollapsed(new Set())} aria-label={text('Expand all')} title={text('Expand all')}><ChevronDown size={16} /></button>
          </div>
        </header>
        <div
          className="org-chart-viewport"
          ref={viewportRef}
          onPointerDown={startPan}
          onPointerMove={pan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          aria-label={text('Organization chart')}
        >
          {loading ? (
            <div className="org-message" role="status">{text('Loading organization chart…')}</div>
          ) : loadError ? (
            <div className="org-message error" role="alert">
              <p>{loadError}</p>
              <button type="button" className="button secondary" onClick={() => { setLoading(true); void loadChart() }}>{text('Retry')}</button>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="org-message" role="status">{nodes.length ? text('No employees match your search or department filter.') : text('No employee reporting relationships found.')}</div>
          ) : (
            <div
              className="org-chart-world"
              ref={contentRef}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              <div className="org-chart-content">{filteredNodes.map(renderNode)}</div>
            </div>
          )}
        </div>
        <footer className="org-chart-footnote">{text('Drag the canvas to pan. Use the controls to zoom or fit the hierarchy.')}</footer>
      </section>

      {editing && (
        <div className="org-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null) }}>
          <section className="org-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="org-manager-title">
            <header>
              <div><span className="eyebrow">{text('REPORTING LINE')}</span><h2 id="org-manager-title">{text('Change manager')}</h2></div>
              <button type="button" className="icon-button" onClick={() => setEditing(null)} disabled={saving} aria-label={text('Close')}><X size={17} /></button>
            </header>
            <p className="org-manager-employee">{editing.name}<small>{editing.jobTitle || text('Title not specified')}</small></p>
            <form onSubmit={updateManager}>
              <label>
                {text('Manager')}
                <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                  <option value="">{text('No manager')}</option>
                  {allEmployees.filter((employee) => employee.employeeId !== editing.employeeId).map((employee) => (
                    <option key={employee.employeeId} value={employee.employeeId}>{employee.name}{employee.jobTitle ? ` · ${employee.jobTitle}` : ''}</option>
                  ))}
                </select>
              </label>
              <label>
                {text('Effective from')}
                <input type="date" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
              </label>
              {actionError && <p className="org-form-error" role="alert">{actionError}</p>}
              <div className="org-dialog-actions">
                <button type="button" className="button secondary" onClick={() => setEditing(null)} disabled={saving}>{text('Cancel')}</button>
                <button type="submit" className="button primary" disabled={saving}>{saving ? text('Saving…') : text('Save changes')}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function findManagerId(nodes: OrgChartNode[], employeeId: number): number | null {
  for (const node of nodes) {
    if (node.children.some((child) => child.employeeId === employeeId)) return node.employeeId
    const nested = findManagerId(node.children, employeeId)
    if (nested !== null) return nested
  }
  return null
}
