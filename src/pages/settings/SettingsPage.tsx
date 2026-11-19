import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { useAuth } from '../../contexts/authHooks'
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

  useEffect(() => {
    return () => {
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current)
    }
  }, [])

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

  return (
    <div className="page">
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Settings"
        subtitle="Shape IntillegenceHR around the way your organization works."
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
                    <option key={p.value} value={p.value}>
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

          {activeId !== 'profile' && activeId !== 'security' && activeId !== 'assistant' && (
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