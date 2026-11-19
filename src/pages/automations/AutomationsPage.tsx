import { useMemo, useState } from 'react'
import {
  Cpu,
  Plus,
  CheckCircle2,
  Clock,
  Settings2,
  RefreshCw,
  TrendingUp,
  Pause,
  Play,
} from 'lucide-react'
import './AutomationsPage.css'

type WorkflowStatus = 'Active' | 'Paused'
type StatusFilter = 'all' | WorkflowStatus

interface Workflow {
  id: string
  name: string
  trigger: string
  action: string
  status: WorkflowStatus
  lastRun: string
  successRate: string
}

const INITIAL_WORKFLOWS: Workflow[] = [
  {
    id: 'wf-1',
    name: 'New Hire Provisioning & IT Checklist',
    trigger: 'Employee Onboarding Created',
    action: 'Generate Google Workspace, Slack & Jira Accounts',
    status: 'Active',
    lastRun: '12 mins ago',
    successRate: '99.4%',
  },
  {
    id: 'wf-2',
    name: 'Probation Review Reminder',
    trigger: 'Day 85 of Employment',
    action: 'Send Manager Evaluation Form & Slack Alert',
    status: 'Active',
    lastRun: '3 hours ago',
    successRate: '100%',
  },
  {
    id: 'wf-3',
    name: 'Leave Balance Year-End Rollover',
    trigger: 'December 31st at Midnight',
    action: 'Calculate carry-over & reset sick leave accruals',
    status: 'Paused',
    lastRun: '10 months ago',
    successRate: '98.1%',
  },
  {
    id: 'wf-4',
    name: 'Offboarding Security Off-ramp',
    trigger: 'Offboarding Request Approved',
    action: 'Revoke VPN access, disable Badge & archive email',
    status: 'Active',
    lastRun: '1 day ago',
    successRate: '100%',
  },
]

export function AutomationsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(INITIAL_WORKFLOWS)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const activeCount = workflows.filter((wf) => wf.status === 'Active').length

  const visibleWorkflows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return workflows.filter((wf) => {
      if (statusFilter !== 'all' && wf.status !== statusFilter) return false
      if (!needle) return true
      return [wf.name, wf.trigger, wf.action].some((field) =>
        field.toLowerCase().includes(needle),
      )
    })
  }, [workflows, query, statusFilter])

  const toggleStatus = (id: string) => {
    setWorkflows((prev) =>
      prev.map((wf) =>
        wf.id === id
          ? { ...wf, status: wf.status === 'Active' ? 'Paused' : 'Active' }
          : wf,
      ),
    )
  }

  return (
    <div className="auto-page">
      <header className="auto-header">
        <div>
          <h1 className="auto-title">
            <Cpu size={26} aria-hidden="true" />
            Automations Center
          </h1>
          <p className="auto-subtitle">
            Build, monitor, and configure event-driven and scheduled enterprise HR workflows.
          </p>
        </div>
        <button type="button" className="button primary auto-create">
          <Plus size={16} aria-hidden="true" />
          Create workflow
        </button>
      </header>

      <ul className="auto-stats" aria-label="Automation summary">
        <li className="auto-card auto-stat">
          <div className="auto-stat-head">
            <span>Active workflows</span>
            <span className="auto-stat-icon auto-stat-icon--green" aria-hidden="true">
              <CheckCircle2 size={16} />
            </span>
          </div>
          <p className="auto-stat-value">{activeCount}</p>
          <p className="auto-stat-note">Operational across 4 departments</p>
        </li>

        <li className="auto-card auto-stat">
          <div className="auto-stat-head">
            <span>Executions in the last 30 days</span>
            <span className="auto-stat-icon auto-stat-icon--blue" aria-hidden="true">
              <RefreshCw size={16} />
            </span>
          </div>
          <p className="auto-stat-value">1,428</p>
          <p className="auto-stat-note auto-stat-note--positive">
            <TrendingUp size={14} aria-hidden="true" />
            12% more than last month
          </p>
        </li>

        <li className="auto-card auto-stat">
          <div className="auto-stat-head">
            <span>Execution success rate</span>
            <span className="auto-stat-icon auto-stat-icon--blue" aria-hidden="true">
              <Clock size={16} />
            </span>
          </div>
          <p className="auto-stat-value">99.4%</p>
          <p className="auto-stat-note">No critical failures reported</p>
        </li>
      </ul>

      <section className="auto-card" aria-labelledby="auto-list-title">
        <div className="auto-list-head">
          <h2 id="auto-list-title" className="auto-list-title">
            Configured workflows
          </h2>
          <span className="auto-count" aria-live="polite">
            Showing {visibleWorkflows.length} of {workflows.length} workflows
          </span>
        </div>

        <div className="auto-toolbar">
          <input
            type="search"
            className="table-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, trigger, or action..."
            aria-label="Search workflows"
          />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Paused">Paused</option>
          </select>
        </div>

        {visibleWorkflows.length === 0 ? (
          <div className="auto-empty">
            <strong>No workflows match your filters</strong>
            <span>Try a different search term or reset the status filter.</span>
          </div>
        ) : (
          <ul className="auto-rows">
            {visibleWorkflows.map((wf) => {
              const isActive = wf.status === 'Active'
              return (
                <li key={wf.id} className="auto-row">
                  <div className="auto-row-main">
                    <div className="auto-row-title">
                      <span className="auto-name">{wf.name}</span>
                      <span
                        className={`auto-status ${
                          isActive ? 'auto-status--active' : 'auto-status--paused'
                        }`}
                      >
                        {wf.status}
                      </span>
                    </div>
                    <dl className="auto-details">
                      <div>
                        <dt>Trigger:</dt>
                        <dd>{wf.trigger}</dd>
                      </div>
                      <div>
                        <dt>Action:</dt>
                        <dd>{wf.action}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="auto-row-side">
                    <div className="auto-run">
                      <span>Last run {wf.lastRun}</span>
                      <span>{wf.successRate} success</span>
                    </div>
                    <div className="auto-actions">
                      <button
                        type="button"
                        className="auto-icon-btn"
                        onClick={() => toggleStatus(wf.id)}
                        aria-label={`${isActive ? 'Pause' : 'Resume'} ${wf.name}`}
                        title={isActive ? 'Pause' : 'Resume'}
                      >
                        {isActive ? (
                          <Pause size={16} aria-hidden="true" />
                        ) : (
                          <Play size={16} aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="auto-icon-btn"
                        aria-label={`Configure ${wf.name}`}
                        title="Settings"
                      >
                        <Settings2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}