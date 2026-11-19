import { apiData, apiRequest } from '../lib/apiClient'

export interface WorkflowPage<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

export interface WorkflowAssignment {
  id: string
  approver_user_id: string
  sequence_order: number
  status: string
  activated_at: string | null
  resolved_at: string | null
  approver?: { id: string; name: string } | null
  delegations?: WorkflowDelegation[]
}

export interface WorkflowStep {
  id: string
  key: string
  sequence: number
  group_key: string
  mode: 'sequential' | 'parallel'
  completion_rule: 'all' | 'any' | 'quorum'
  quorum: number | null
  status: string
  assignments: WorkflowAssignment[]
}

export interface WorkflowInstance {
  id: string
  initiator_user_id: string
  resource_type: string
  resource_id: string
  status: string
  submitted_at: string | null
  completed_at: string | null
  created_at?: string | null
  updated_at?: string | null
  initiator?: { id: string; name: string } | null
  version?: {
    version_number: number
    template?: { name: string; module: string; resource_type: string }
  }
  steps?: WorkflowStep[]
  actions?: WorkflowAction[]
}

export interface WorkflowAction {
  id: string
  action: string
  comment: string | null
  actor_user_id: string
  occurred_at: string
  actor?: { id: string; name: string } | null
}

export interface WorkflowEvent {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  data: Record<string, unknown> | null
  occurred_at: string
  actor?: { id: string; name: string } | null
}

export interface WorkflowTemplate {
  id: string
  key: string
  module: string
  resource_type: string
  name: string
  is_active: boolean
  versions: WorkflowTemplateVersion[]
}

export interface WorkflowTemplateVersion {
  id: string
  version_number: number
  status: 'draft' | 'published'
  published_at: string | null
}

export interface WorkflowDelegation {
  id: string
  delegator_user_id: string
  delegate_user_id: string
  approval_assignment_id: string
  starts_at: string
  ends_at: string
  revoked_at: string | null
  delegator?: { id: string; name: string }
  delegate?: { id: string; name: string }
  assignment?: {
    status?: string
    step?: {
      status?: string
      instance?: Pick<WorkflowInstance, 'id' | 'resource_type' | 'resource_id' | 'status'>
    }
  }
}

export interface WorkflowListFilters {
  mine?: boolean
  assignedToMe?: boolean
  team?: boolean
  resourceType?: string
  module?: string
  status?: string
  submittedFrom?: string
  submittedTo?: string
  page?: number
  pageSize?: number
}

export function listWorkflowInstances(filters: WorkflowListFilters = {}): Promise<WorkflowPage<WorkflowInstance>> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  })
  return apiRequest<WorkflowPage<WorkflowInstance>>(`/api/v1/workflow-instances?${params}`)
}

export function getWorkflowInstance(id: string): Promise<WorkflowInstance> {
  return apiData<WorkflowInstance>(`/api/v1/workflow-instances/${id}`)
}

export function getWorkflowInstanceResource(id: string): Promise<Record<string, unknown>> {
  return apiData<Record<string, unknown>>(`/api/v1/workflow-instances/${id}/resource`)
}

export function getWorkflowHistory(id: string, page = 1): Promise<WorkflowPage<WorkflowEvent>> {
  return apiRequest<WorkflowPage<WorkflowEvent>>(`/api/v1/workflow-instances/${id}/history?page=${page}&pageSize=100`)
}

export function decideWorkflow(
  instanceId: string,
  input: { assignmentId: string; action: 'approve' | 'reject' | 'return'; comment: string; idempotencyKey: string },
): Promise<WorkflowInstance> {
  return apiData<WorkflowInstance>(`/api/v1/workflow-instances/${instanceId}/actions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listWorkflowTemplates(page = 1): Promise<WorkflowPage<WorkflowTemplate>> {
  return apiRequest<WorkflowPage<WorkflowTemplate>>(`/api/v1/workflow-templates?page=${page}&pageSize=100`)
}

export function createWorkflowTemplate(input: {
  key: string
  module: string
  resourceType: string
  name: string
}): Promise<WorkflowTemplate> {
  return apiData<WorkflowTemplate>('/api/v1/workflow-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createWorkflowVersion(
  templateId: string,
  steps: Array<Record<string, unknown>>,
): Promise<WorkflowTemplateVersion> {
  return apiData<WorkflowTemplateVersion>(`/api/v1/workflow-templates/${templateId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ steps }),
  })
}

export function publishWorkflowVersion(versionId: string): Promise<WorkflowTemplateVersion> {
  return apiData<WorkflowTemplateVersion>(`/api/v1/workflow-template-versions/${versionId}/publish`, {
    method: 'POST',
  })
}

export function listWorkflowDelegations(page = 1): Promise<WorkflowPage<WorkflowDelegation>> {
  return apiRequest<WorkflowPage<WorkflowDelegation>>(`/api/v1/workflow-delegations?page=${page}&pageSize=100`)
}

export function createWorkflowDelegation(input: {
  assignmentId: string
  delegateUserId: string
  startsAt: string
  endsAt: string
}): Promise<WorkflowDelegation> {
  return apiData<WorkflowDelegation>('/api/v1/workflow-delegations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function revokeWorkflowDelegation(id: string): Promise<WorkflowDelegation> {
  return apiData<WorkflowDelegation>(`/api/v1/workflow-delegations/${id}`, { method: 'DELETE' })
}

export function getWorkflowResource(type: string, id: string): Promise<Record<string, unknown>> {
  const resources: Record<string, string> = {
    leave_request: 'leave-requests',
    onboarding_case: 'onboarding-cases',
    offboarding_case: 'offboarding-cases',
  }
  const endpoint = resources[type]
  if (!endpoint) return Promise.reject(new Error('This workflow resource type has no detail screen.'))
  return apiData<Record<string, unknown>>(`/api/v1/${endpoint}/${id}`)
}
