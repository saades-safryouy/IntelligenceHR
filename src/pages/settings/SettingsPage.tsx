import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
import { apiData, apiRequest, isApiDataMode } from '../../lib/apiClient'
import './SettingsPage.css'

type SectionId =
  | 'profile'
  | 'account'
  | 'users'
  | 'roles'
  | 'security'
  | 'assistant'
  | 'leave-types'
  | 'leave-policies'
  | 'onboarding'
  | 'offboarding'
  | 'equipment'
  | 'applications'
  | 'notifications'
  | 'languages'
  | 'appearance'
  | 'audit-logs'

interface SectionMeta {
  id: SectionId
  label: string
  eyebrow: string
  title: string
  description: string
}

const SECTIONS: SectionMeta[] = [
  {
    id: 'profile',
    label: 'Profile',
    eyebrow: 'PROFILE',
    title: 'Profile details',
    description:
      'Manage the identity and contact details attached to your workspace account.',
  },
  { id: 'account', label: 'Account', eyebrow: 'ACCOUNT', title: 'Account', description: 'Manage your sign-in and account preferences.' },
  { id: 'users', label: 'Users', eyebrow: 'USERS', title: 'Users', description: 'Invite, deactivate and manage workspace users.' },
  { id: 'roles', label: 'Roles & Permissions', eyebrow: 'ACCESS', title: 'Roles & Permissions', description: 'Define what each role can see and do.' },
  {
    id: 'security',
    label: 'Security & Compliance',
    eyebrow: 'SECURITY',
    title: 'Security & compliance guardrails',
    description:
      'Configure global enterprise parameters and compliance guardrails.',
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    eyebrow: 'INTELLIGENCE',
    title: 'IntelligenceHR assistant configuration',
    description:
      'Control AI assistant permissions and choose the provider behind it.',
  },
  { id: 'leave-types', label: 'Leave Types', eyebrow: 'LEAVE', title: 'Leave types', description: 'Configure the types of leave employees can request.' },
  { id: 'leave-policies', label: 'Leave Policies', eyebrow: 'LEAVE', title: 'Leave policies', description: 'Set accrual, carry-over and approval rules.' },
  { id: 'onboarding', label: 'Onboarding Checklists', eyebrow: 'LIFECYCLE', title: 'Onboarding checklists', description: 'Manage the task templates used for new hires.' },
  { id: 'offboarding', label: 'Offboarding Checklists', eyebrow: 'LIFECYCLE', title: 'Offboarding checklists', description: 'Manage the task templates used for leavers.' },
  { id: 'equipment', label: 'Equipment', eyebrow: 'ASSETS', title: 'Equipment', description: 'Manage the equipment catalog assigned to employees.' },
  { id: 'applications', label: 'Applications', eyebrow: 'ASSETS', title: 'Applications', description: 'Manage the applications provisioned to employees.' },
  { id: 'notifications', label: 'Notifications', eyebrow: 'NOTIFICATIONS', title: 'Notifications', description: 'Choose which events notify whom, and how.' },
  { id: 'languages', label: 'Languages', eyebrow: 'LOCALIZATION', title: 'Languages', description: 'Manage the languages available in the workspace.' },
  { id: 'appearance', label: 'Appearance', eyebrow: 'APPEARANCE', title: 'Appearance', description: 'Customize how the workspace looks.' },
  { id: 'audit-logs', label: 'Audit Logs', eyebrow: 'COMPLIANCE', title: 'Audit logs', description: 'Review who changed what, and when.' },
]

const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI GPT-4o (Secure Enterprise Tenant)' },
  { value: 'anthropic', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'local', label: 'Local Llama 3.3 70B (Air-gapped)' },
]

/** Role keys HR may assign (mirrors UserController::ASSIGNABLE_ROLES). */
const ASSIGNABLE_ROLES = [
  'hr-admin',
  'hr-manager',
  'department-manager',
  'manager',
  'workflow-approver',
  'employee',
  'local-it',
  'isd',
]

const AUDIT_PAGE_SIZE = 25

interface ApiUser {
  id: string
  name: string
  email: string
  roles: string[]
  employee_id: number | null
  employee: string | null
}

interface ApiRole {
  key: string
  permissions: string[]
}

interface ApiLeaveType {
  id: string
  code?: string | null
  name_key: string
  color: string
  paid: boolean
  default_entitlement_days: number
  carry_over_days: number
  requires_approval: boolean
}

interface ApiAuditLog {
  id: string
  user_id: string | null
  user_name: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  details: unknown
  created_at: string
}

interface LeaveTypeForm {
  editingId: string | null
  id: string
  code: string
  nameKey: string
  color: string
  paid: boolean
  defaultEntitlementDays: string
  carryOverDays: string
  requiresApproval: boolean
}

const EMPTY_TYPE_FORM: LeaveTypeForm = {
  editingId: null,
  id: '',
  code: '',
  nameKey: '',
  color: '#3b82f6',
  paid: true,
  defaultEntitlementDays: '0',
  carryOverDays: '0',
  requiresApproval: true,
}

interface ToggleRowProps {
  id: string
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

function ToggleRow({ id, title, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <label htmlFor={id}>{title}</label>
        <p id={`${id}-description`}>{description}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="setting-switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-description`}
        disabled={disabled}
      />
    </div>
  )
}

export function SettingsPage() {
  const { currentUser } = useAuth()

  const [activeId, setActiveId] = useState<SectionId>('profile')
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<number | null>(null)

  // Profile
  const [language, setLanguage] = useState('English')

  // Security & compliance
  const [strictRbac, setStrictRbac] = useState(true)
  const [twoFactor, setTwoFactor] = useState(true)

  // AI assistant
  const [aiEnabled, setAiEnabled] = useState(true)
  const [provider, setProvider] = useState(LLM_PROVIDERS[0].value)

  // Users & roles (server-backed)
  const [users, setUsers] = useState<ApiUser[] | null>(null)
  const [usersError, setUsersError] = useState('')
  const [roles, setRoles] = useState<ApiRole[] | null>(null)
  const [rolesError, setRolesError] = useState('')
  const [savingUserId, setSavingUserId] = useState<string | null>(null)

  // Leave types & policies (server-backed)
  const [leaveTypes, setLeaveTypes] = useState<ApiLeaveType[] | null>(null)
  const [leaveTypesError, setLeaveTypesError] = useState('')
  const [typeForm, setTypeForm] = useState<LeaveTypeForm | null>(null)
  const [typeError, setTypeError] = useState('')
  const [savingType, setSavingType] = useState(false)
  const [policyDrafts, setPolicyDrafts] = useState<
    Record<string, { defaultEntitlementDays: string; carryOverDays: string; requiresApproval: boolean }>
  >({})
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null)

  // Audit logs (server-backed)
  const [auditLogs, setAuditLogs] = useState<ApiAuditLog[] | null>(null)
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditError, setAuditError] = useState('')
  const [auditLoading, setAuditLoading] = useState(false)

  useEffect(() => {
    return () => {
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current)
    }
  }, [])

  const loadUsers = () => {
    if (!isApiDataMode) return
    setUsersError('')
    apiData<ApiUser[]>('/api/v1/users')
      .then(setUsers)
      .catch((err: unknown) => setUsersError(err instanceof Error ? err.message : 'Could not load users.'))
  }

  const loadRoles = () => {
    if (!isApiDataMode) return
    setRolesError('')
    apiData<ApiRole[]>('/api/v1/roles')
      .then(setRoles)
      .catch((err: unknown) => setRolesError(err instanceof Error ? err.message : 'Could not load roles.'))
  }

  const loadLeaveTypes = () => {
    if (!isApiDataMode) return
    setLeaveTypesError('')
    apiData<ApiLeaveType[]>('/api/v1/leave-types')
      .then((types) => {
        setLeaveTypes(types)
        setPolicyDrafts((cur) => {
          const next = { ...cur }
          for (const t of types) {
            next[t.id] ??= {
              defaultEntitlementDays: String(t.default_entitlement_days ?? 0),
              carryOverDays: String(t.carry_over_days ?? 0),
              requiresApproval: t.requires_approval ?? true,
            }
          }
          return next
        })
      })
      .catch((err: unknown) => setLeaveTypesError(err instanceof Error ? err.message : 'Could not load leave types.'))
  }

  const loadAuditLogs = (page: number) => {
    if (!isApiDataMode) return
    setAuditLoading(true)
    setAuditError('')
    apiRequest<{ data: ApiAuditLog[]; page: number; pageSize: number; total: number }>(
      `/api/v1/audit-logs?page=${page}&pageSize=${AUDIT_PAGE_SIZE}`,
    )
      .then((res) => {
        setAuditLogs(res.data)
        setAuditPage(res.page)
        setAuditTotal(res.total)
      })
      .catch((err: unknown) => setAuditError(err instanceof Error ? err.message : 'Could not load audit logs.'))
      .finally(() => setAuditLoading(false))
  }

  useEffect(() => {
    if (!isApiDataMode) return
    if (activeId === 'users') {
      if (users === null) loadUsers()
      if (roles === null) loadRoles()
    } else if (activeId === 'roles') {
      if (roles === null) loadRoles()
    } else if (activeId === 'leave-types' || activeId === 'leave-policies') {
      if (leaveTypes === null) loadLeaveTypes()
    } else if (activeId === 'audit-logs') {
      loadAuditLogs(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const section = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0]

  const selectSection = (id: SectionId) => {
    setActiveId(id)
    setSaved(false)
  }

  const handleSave = () => {
    setSaved(true)
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(false), 3000)
  }

  const saveBar = (
    <div className="setting-savebar">
      <button type="button" className="button primary" onClick={handleSave}>
        Save changes
      </button>
      <span className="setting-saved" role="status">
        {saved && (
          <>
            <CheckCircle2 size={16} aria-hidden="true" />
            Saved successfully
          </>
        )}
      </span>
    </div>
  )

  const toggleUserRole = async (user: ApiUser, role: string) => {
    const next = user.roles.includes(role)
      ? user.roles.filter((r) => r !== role)
      : [...user.roles, role]
    setSavingUserId(user.id)
    setUsersError('')
    try {
      const updated = await apiData<ApiUser>(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: next }),
      })
      setUsers((cur) => cur?.map((u) => (u.id === user.id ? updated : u)) ?? null)
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Could not update roles.')
    } finally {
      setSavingUserId(null)
    }
  }

  const openTypeForm = (type?: ApiLeaveType) => {
    setTypeError('')
    setTypeForm(
      type
        ? {
            editingId: type.id,
            id: type.id,
            code: type.code ?? '',
            nameKey: type.name_key,
            color: type.color,
            paid: type.paid,
            defaultEntitlementDays: String(type.default_entitlement_days ?? 0),
            carryOverDays: String(type.carry_over_days ?? 0),
            requiresApproval: type.requires_approval ?? true,
          }
        : { ...EMPTY_TYPE_FORM },
    )
  }

  const saveLeaveType = async () => {
    if (!typeForm) return
    const id = typeForm.id.trim()
    const nameKey = typeForm.nameKey.trim()
    if (!typeForm.editingId && !id) return setTypeError('Please enter a short id (e.g. parental).')
    if (!nameKey) return setTypeError('Please enter a name key (e.g. leave.parental).')
    const body = {
      code: typeForm.code.trim() || null,
      name_key: nameKey,
      color: typeForm.color,
      paid: typeForm.paid,
      default_entitlement_days: Math.max(0, Number(typeForm.defaultEntitlementDays) || 0),
      carry_over_days: Math.max(0, Number(typeForm.carryOverDays) || 0),
      requires_approval: typeForm.requiresApproval,
    }
    setSavingType(true)
    setTypeError('')
    try {
      if (typeForm.editingId) {
        await apiData(`/api/v1/leave-types/${typeForm.editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      } else {
        await apiData('/api/v1/leave-types', {
          method: 'POST',
          body: JSON.stringify({ id, ...body }),
        })
      }
      setTypeForm(null)
      loadLeaveTypes()
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : 'Could not save the leave type.')
    } finally {
      setSavingType(false)
    }
  }

  const deleteLeaveType = async (type: ApiLeaveType) => {
    if (!window.confirm(`Delete the "${type.name_key}" leave type? Existing requests keep their type id, but new requests can no longer use it.`)) return
    setTypeError('')
    try {
      await apiData(`/api/v1/leave-types/${type.id}`, { method: 'DELETE' })
      loadLeaveTypes()
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : 'Could not delete the leave type.')
    }
  }

  const savePolicy = async (type: ApiLeaveType) => {
    const draft = policyDrafts[type.id]
    if (!draft) return
    setSavingPolicyId(type.id)
    setLeaveTypesError('')
    try {
      const updated = await apiData<ApiLeaveType>(`/api/v1/leave-types/${type.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          default_entitlement_days: Math.max(0, Number(draft.defaultEntitlementDays) || 0),
          carry_over_days: Math.max(0, Number(draft.carryOverDays) || 0),
          requires_approval: draft.requiresApproval,
        }),
      })
      setLeaveTypes((cur) => cur?.map((t) => (t.id === type.id ? updated : t)) ?? null)
    } catch (err) {
      setLeaveTypesError(err instanceof Error ? err.message : 'Could not save the policy.')
    } finally {
      setSavingPolicyId(null)
    }
  }

  const auditLastPage = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE))
  const apiNotice = !isApiDataMode && (
    <p className="setting-hint">This section needs the connected API — switch the app to API data mode to manage it.</p>
  )

  return (
    <div className="page">
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Settings"
        subtitle="Shape IntelligenceHR around the way your organization works."
      />

      <div className="settings-layout">
        <aside className="settings-menu" aria-label="Settings sections">
          {SECTIONS.map((item) => (
            <button
              type="button"
              className={item.id === activeId ? 'active' : ''}
              aria-current={item.id === activeId ? 'page' : undefined}
              key={item.id}
              onClick={() => selectSection(item.id)}
            >
              {item.label}
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          ))}
        </aside>

        <section className="panel settings-content" aria-labelledby="settings-section-title">
          <span className="eyebrow">{section.eyebrow}</span>
          <h2 id="settings-section-title">{section.title}</h2>
          <p>{section.description}</p>

          {activeId === 'profile' && (
            <>
              <div className="settings-avatar">
                <div className="profile-avatar avatar">{currentUser?.initials ?? '??'}</div>

                <div>
                  <strong>{currentUser?.name ?? '—'}</strong>
                  <span>{currentUser?.title ?? ''}</span>
                </div>

                <button type="button" className="button secondary">
                  Change photo
                </button>
              </div>

              <div className="settings-fields">
                <label>
                  Full name
                  <input value={currentUser?.name ?? ''} readOnly />
                </label>

                <label>
                  Role
                  <input value={currentUser?.title ?? ''} readOnly />
                </label>

                <label>
                  Email
                  <input value={currentUser?.email ?? ''} readOnly />
                </label>

                <label>
                  Language
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option>English</option>
                    <option>Français</option>
                    <option>العربية</option>
                  </select>
                </label>
              </div>

              {saveBar}
            </>
          )}

          {activeId === 'security' && (
            <>
              <div className="setting-group">
                <ToggleRow
                  id="setting-strict-rbac"
                  title="Strict Role-Based Access Control (RBAC)"
                  description="Enforce strict department boundaries and PII field redaction for non-admin users."
                  checked={strictRbac}
                  onChange={setStrictRbac}
                />
                <ToggleRow
                  id="setting-two-factor"
                  title="Mandatory Two-Factor Authentication (2FA)"
                  description="Require all HR personnel and managers to authenticate with TOTP or hardware keys."
                  checked={twoFactor}
                  onChange={setTwoFactor}
                />
              </div>

              {saveBar}
            </>
          )}

          {activeId === 'assistant' && (
            <>
              <div className="setting-group">
                <ToggleRow
                  id="setting-ai-enabled"
                  title="Enable Ask Intelligence AI Assistant"
                  description="Allow users to query HR policies and workforce analytics through conversational AI."
                  checked={aiEnabled}
                  onChange={setAiEnabled}
                />
              </div>

              <label className="setting-field">
                LLM embeddings provider
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={!aiEnabled}
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {!aiEnabled && (
                  <span className="setting-hint">
                    Turn the assistant on to change its provider.
                  </span>
                )}
              </label>

              {saveBar}
            </>
          )}

          {activeId === 'users' && (
            <>
              {apiNotice}
              {usersError && <p className="setting-error" role="alert">{usersError}</p>}
              {users === null && isApiDataMode ? (
                <p className="setting-hint">Loading users…</p>
              ) : (
                <table className="setting-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Linked employee</th>
                      <th>Roles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(users ?? []).map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </td>
                        <td>{user.employee ?? '—'}</td>
                        <td>
                          <div className="setting-roles">
                            {ASSIGNABLE_ROLES.map((role) => (
                              <label key={role} className="setting-role-check">
                                <input
                                  type="checkbox"
                                  checked={user.roles.includes(role)}
                                  disabled={savingUserId === user.id || user.id === currentUser?.userId}
                                  onChange={() => void toggleUserRole(user, role)}
                                />
                                {role}
                              </label>
                            ))}
                            {user.roles
                              .filter((r) => !ASSIGNABLE_ROLES.includes(r))
                              .map((role) => (
                                <span key={role} className="setting-role-tag">
                                  {role}
                                </span>
                              ))}
                          </div>
                          {user.id === currentUser?.userId && (
                            <small className="setting-hint">You cannot change your own roles.</small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="setting-hint">
                Super-admin roles can only be granted by a super-admin. Changes apply immediately and
                are recorded in the audit log.
              </p>
            </>
          )}

          {activeId === 'roles' && (
            <>
              {apiNotice}
              {rolesError && <p className="setting-error" role="alert">{rolesError}</p>}
              {roles === null && isApiDataMode ? (
                <p className="setting-hint">Loading roles…</p>
              ) : (
                <table className="setting-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Permissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(roles ?? []).map((role) => (
                      <tr key={role.key}>
                        <td>
                          <strong>{role.key}</strong>
                        </td>
                        <td>
                          <div className="setting-perms">
                            {role.permissions.length === 0
                              ? '—'
                              : role.permissions.map((perm) => (
                                <code key={perm}>{perm}</code>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="setting-hint">
                Permissions come from the server role map. Employees whose job title is an HR title
                (HR, Human Resources, Talent Acquisition, Recruiter, People Operations, People &amp; Culture)
                automatically gain the hr-manager role.
              </p>
            </>
          )}

          {activeId === 'leave-types' && (
            <>
              {apiNotice}
              {leaveTypesError && <p className="setting-error" role="alert">{leaveTypesError}</p>}
              {leaveTypes === null && isApiDataMode ? (
                <p className="setting-hint">Loading leave types…</p>
              ) : (
                <>
                  <table className="setting-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Code</th>
                        <th>Paid</th>
                        <th>Default days</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {(leaveTypes ?? []).map((type) => (
                        <tr key={type.id}>
                          <td>
                            <strong>{type.name_key}</strong>
                            <small>{type.id}</small>
                          </td>
                          <td>{type.code ?? '—'}</td>
                          <td>{type.paid ? 'Yes' : 'No'}</td>
                          <td>{type.default_entitlement_days}</td>
                          <td className="setting-row-actions">
                            <button type="button" className="button secondary" onClick={() => openTypeForm(type)}>
                              Edit
                            </button>
                            <button type="button" className="button secondary" onClick={() => void deleteLeaveType(type)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="setting-savebar">
                    <button type="button" className="button primary" onClick={() => openTypeForm()}>
                      New leave type
                    </button>
                  </div>

                  {typeForm && (
                    <div className="setting-form">
                      <h3>{typeForm.editingId ? `Edit ${typeForm.editingId}` : 'New leave type'}</h3>
                      <div className="settings-fields">
                        {!typeForm.editingId && (
                          <label>
                            Short id
                            <input
                              value={typeForm.id}
                              onChange={(e) => setTypeForm({ ...typeForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                              placeholder="parental"
                            />
                          </label>
                        )}
                        <label>
                          Name key
                          <input
                            value={typeForm.nameKey}
                            onChange={(e) => setTypeForm({ ...typeForm, nameKey: e.target.value })}
                            placeholder="leave.parental"
                          />
                        </label>
                        <label>
                          Code
                          <input
                            value={typeForm.code}
                            onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })}
                            placeholder="PARENTAL"
                          />
                        </label>
                        <label>
                          Color
                          <input
                            type="color"
                            value={typeForm.color}
                            onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                          />
                        </label>
                        <label className="setting-check">
                          <input
                            type="checkbox"
                            checked={typeForm.paid}
                            onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.checked })}
                          />
                          Paid leave
                        </label>
                        <label>
                          Default entitlement (days)
                          <input
                            type="number"
                            min={0}
                            value={typeForm.defaultEntitlementDays}
                            onChange={(e) => setTypeForm({ ...typeForm, defaultEntitlementDays: e.target.value })}
                          />
                        </label>
                        <label>
                          Carry-over (days)
                          <input
                            type="number"
                            min={0}
                            value={typeForm.carryOverDays}
                            onChange={(e) => setTypeForm({ ...typeForm, carryOverDays: e.target.value })}
                          />
                        </label>
                        <label className="setting-check">
                          <input
                            type="checkbox"
                            checked={typeForm.requiresApproval}
                            onChange={(e) => setTypeForm({ ...typeForm, requiresApproval: e.target.checked })}
                          />
                          Requires approval
                        </label>
                      </div>
                      {typeError && <p className="setting-error" role="alert">{typeError}</p>}
                      <div className="setting-savebar">
                        <button type="button" className="button secondary" onClick={() => setTypeForm(null)}>
                          Cancel
                        </button>
                        <button type="button" className="button primary" onClick={() => void saveLeaveType()} disabled={savingType}>
                          {savingType ? 'Saving…' : 'Save leave type'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeId === 'leave-policies' && (
            <>
              {apiNotice}
              {leaveTypesError && <p className="setting-error" role="alert">{leaveTypesError}</p>}
              {leaveTypes === null && isApiDataMode ? (
                <p className="setting-hint">Loading policies…</p>
              ) : (
                <table className="setting-table">
                  <thead>
                    <tr>
                      <th>Leave type</th>
                      <th>Default entitlement (days)</th>
                      <th>Carry-over (days)</th>
                      <th>Requires approval</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {(leaveTypes ?? []).map((type) => {
                      const draft = policyDrafts[type.id] ?? {
                        defaultEntitlementDays: String(type.default_entitlement_days ?? 0),
                        carryOverDays: String(type.carry_over_days ?? 0),
                        requiresApproval: type.requires_approval ?? true,
                      }
                      return (
                        <tr key={type.id}>
                          <td>
                            <strong>{type.name_key}</strong>
                            <small>{type.id}</small>
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              aria-label={`${type.name_key} default entitlement days`}
                              value={draft.defaultEntitlementDays}
                              onChange={(e) =>
                                setPolicyDrafts((cur) => ({
                                  ...cur,
                                  [type.id]: { ...draft, defaultEntitlementDays: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              aria-label={`${type.name_key} carry-over days`}
                              value={draft.carryOverDays}
                              onChange={(e) =>
                                setPolicyDrafts((cur) => ({
                                  ...cur,
                                  [type.id]: { ...draft, carryOverDays: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`${type.name_key} requires approval`}
                              checked={draft.requiresApproval}
                              onChange={(e) =>
                                setPolicyDrafts((cur) => ({
                                  ...cur,
                                  [type.id]: { ...draft, requiresApproval: e.target.checked },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => void savePolicy(type)}
                              disabled={savingPolicyId === type.id}
                            >
                              {savingPolicyId === type.id ? 'Saving…' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <p className="setting-hint">
                Default entitlement is the starting balance for new employees. Carry-over is how many
                unused days roll into the next year.
              </p>
            </>
          )}

          {activeId === 'audit-logs' && (
            <>
              {apiNotice}
              {auditError && <p className="setting-error" role="alert">{auditError}</p>}
              {auditLoading && auditLogs === null ? (
                <p className="setting-hint">Loading audit logs…</p>
              ) : (
                <>
                  <table className="setting-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Resource</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(auditLogs ?? []).map((log) => (
                        <tr key={log.id}>
                          <td>{new Date(log.created_at).toLocaleString()}</td>
                          <td>{log.user_name ?? '—'}</td>
                          <td>
                            <code>{log.action}</code>
                          </td>
                          <td>
                            {[log.resource_type, log.resource_id].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td>{typeof log.details === 'string' ? log.details : '—'}</td>
                        </tr>
                      ))}
                      {(auditLogs ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5}>No audit entries yet — actions you take from now on will appear here.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="setting-savebar">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={auditPage <= 1 || auditLoading}
                      onClick={() => loadAuditLogs(auditPage - 1)}
                    >
                      Previous
                    </button>
                    <span className="setting-hint">
                      Page {auditPage} of {auditLastPage} ({auditTotal} entries)
                    </span>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={auditPage >= auditLastPage || auditLoading}
                      onClick={() => loadAuditLogs(auditPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {activeId !== 'profile' &&
            activeId !== 'security' &&
            activeId !== 'assistant' &&
            activeId !== 'users' &&
            activeId !== 'roles' &&
            activeId !== 'leave-types' &&
            activeId !== 'leave-policies' &&
            activeId !== 'audit-logs' && (
              <div className="setting-empty">
                <strong>Nothing to configure here yet</strong>
                <span>Settings for {section.label.toLowerCase()} will appear in this panel.</span>
              </div>
            )}
        </section>
      </div>
    </div>
  )
}
