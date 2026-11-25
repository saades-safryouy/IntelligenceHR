import { apiData, apiRequest } from '../lib/apiClient'

/**
 * Payroll API client (BRD §8.1). Single resources use the {data}
 * envelope (apiData); paged lists use the bare {data, page, pageSize,
 * total} envelope (apiRequest). 422s from the lifecycle rules
 * (FR-20, D-01, close-block, disabled jurisdiction) surface as
 * ApiError with the server's message — pages show it verbatim.
 */

export type PayrollRunStatus = 'draft' | 'calculated' | 'validated' | 'approved' | 'closed'

export interface PayrollRunTotals {
  employees_calculated?: number
  employees_missing_structure?: number
  gross_total?: number
  net_total?: number
  employee_contributions_total?: number
  employer_contributions_total?: number
  tax_total?: number
  employer_cost_total?: number
  minimum_wage_overrides?: Record<string, string>
  last_send_back_reason?: string
}

export interface PayrollRun {
  id: number
  period_year: number
  period_month: number
  period_start: string
  period_end: string
  scope_type: string
  scope_id: string | null
  status: PayrollRunStatus
  type: string
  jurisdiction_code: string | null
  jurisdiction_profile_version: string | null
  client_config_version: number | null
  component_catalog_version: number | null
  totals: PayrollRunTotals | null
  payslip_count: number
  created_by: string | null
  created_by_name: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ValidationCheck {
  code: string
  message: string
  blocking: boolean
  employee_id?: number
  employee_name?: string
}

export interface ValidationResults {
  blocking: ValidationCheck[]
  warnings: ValidationCheck[]
  employees_checked: number
  payslips_checked: number
}

export interface RunDetail extends PayrollRun {
  validation?: ValidationResults
}

export interface PayslipCalculation {
  engine_version?: string
  jurisdiction?: { code?: string; profile_version?: string }
  parameter_set?: { id?: number | null; valid_from?: string | null }
  client_config_version?: number | null
  component_catalog_version?: number | null
  period?: string
  employee?: { id?: number; cnss_number?: string | null; category?: string | null; hired_at?: string | null }
  inputs?: {
    base_salary?: number
    dependants?: number
    overtime?: { normal_hours?: number; night_hours?: number; holiday_hours?: number; hourly_rate?: number }
    lines?: Array<{
      component?: string
      category?: string | null
      amount?: number
      cnss_subject?: boolean
      ir_subject?: boolean
      exempt_cnss?: number
      exempt_ir?: number
    }>
  }
  computation?: {
    gross?: number
    social_base?: number
    tax_base?: number
    contributions?: {
      employee?: { by_branch?: Record<string, number>; total?: number }
      employer?: { by_branch?: Record<string, number>; total?: number }
    }
    taxable_income?: { sbi?: number; abatements?: Array<{ key?: string; amount?: number }>; net_taxable?: number }
    tax?: { amount?: number; details?: Record<string, number | string> }
    deductions?: Array<{ type?: string; amount?: number }>
    deductions_total?: number
    net?: number
    employer_cost?: number
  }
  ytd?: { gross?: number; cnss_employee?: number; ir?: number }
  warnings?: Array<{ code?: string; component?: string }>
  used_parameter_keys?: string[]
}

export interface PayrollPayslip {
  id: number
  payroll_run_id: number
  employee_id: number
  employee_name: string | null
  period_year: number
  period_month: number
  gross: number | null
  net: number | null
  employer_cost: number | null
  calculation: PayslipCalculation
  pdf_path: string | null
  created_at: string | null
}

export interface PayrollComponent {
  id: number
  code: string
  name_fr: string | null
  name_ar: string | null
  name_en: string | null
  category: string
  cnss_subject: boolean
  ir_subject: boolean
  cap_type: string | null
  cap_value: number | null
  counts_toward_tax_abatement: boolean
  is_system: boolean
  suggested_by_profile: string | null
  active: boolean
  effective_from: string | null
  effective_to: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SalaryStructureLine {
  id?: number
  component_id?: number | null
  component_code: string
  amount: number
  notes?: string | null
}

export interface SalaryStructure {
  id: number
  employee_id: number
  employee_name: string | null
  base_salary: number
  contractual_hours_month: number | null
  employment_type: string | null
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  lines: SalaryStructureLine[]
  created_at: string | null
  updated_at: string | null
}

export interface ClientConfig {
  id: number
  version: number
  settings: Record<string, unknown>
  effective_from: string | null
  effective_to: string | null
  created_at: string | null
}

export interface LegalParameter {
  key: string
  value: number
  confidence: string | null
  valid_from: string | null
  valid_to: string | null
}

export interface JurisdictionRow {
  jurisdiction_code: string
  jurisdiction_profile_version: string | null
  status: string
  enabled_at: string | null
  disabled_at: string | null
}

export interface PagedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
}

export interface ParametersResponse {
  jurisdiction: string
  profile_version: string
  at: string
  parameters: LegalParameter[]
  total_count: number
  unvalidated_count: number
  unvalidated_keys: string[]
}

export function formatDH(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} DH`
}

export function periodLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function monthName(month: number): string {
  return [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][month - 1] ?? String(month)
}

function asPaged<T>(response: PagedResponse<T> | undefined): PagedResponse<T> {
  return response ?? { data: [], page: 1, pageSize: 20, total: 0 }
}

// --- Runs ------------------------------------------------------------

export async function listRuns(page = 1, pageSize = 20, status?: string): Promise<PagedResponse<PayrollRun>> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) query.set('status', status)
  return asPaged(await apiRequest<PagedResponse<PayrollRun>>(`/api/v1/payroll/runs?${query}`))
}

export async function createRun(input: {
  period_year: number
  period_month: number
  jurisdiction_code?: string
  scope_type?: string
  scope_id?: string | null
}): Promise<PayrollRun> {
  return apiData<PayrollRun>('/api/v1/payroll/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getRun(id: number): Promise<RunDetail> {
  return apiData<RunDetail>(`/api/v1/payroll/runs/${id}`)
}

export async function calculateRun(
  id: number,
  overtime: Record<string, { normal_hours?: number; night_hours?: number; holiday_hours?: number }>,
): Promise<PayrollRun> {
  return apiData<PayrollRun>(`/api/v1/payroll/runs/${id}/calculate`, {
    method: 'POST',
    body: JSON.stringify({ overtime }),
  })
}

export async function validateRun(
  id: number,
  minimumWageOverrides: Record<string, string>,
): Promise<PayrollRun> {
  return apiData<PayrollRun>(`/api/v1/payroll/runs/${id}/validate`, {
    method: 'POST',
    body: JSON.stringify({ minimum_wage_overrides: minimumWageOverrides }),
  })
}

export async function approveRun(id: number): Promise<PayrollRun> {
  return apiData<PayrollRun>(`/api/v1/payroll/runs/${id}/approve`, { method: 'POST' })
}

export async function closeRun(id: number): Promise<PayrollRun> {
  return apiData<PayrollRun>(`/api/v1/payroll/runs/${id}/close`, { method: 'POST' })
}

export async function sendBackRun(id: number, reason: string): Promise<PayrollRun> {
  return apiData<PayrollRun>(`/api/v1/payroll/runs/${id}/send-back`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function listRunPayslips(id: number, page = 1, pageSize = 20): Promise<PagedResponse<PayrollPayslip>> {
  return asPaged(await apiRequest<PagedResponse<PayrollPayslip>>(`/api/v1/payroll/runs/${id}/payslips?page=${page}&pageSize=${pageSize}`))
}

export async function getPayslip(id: number): Promise<PayrollPayslip> {
  return apiData<PayrollPayslip>(`/api/v1/payroll/payslips/${id}`)
}

export async function listMyPayslips(page = 1, pageSize = 20): Promise<PagedResponse<PayrollPayslip>> {
  return asPaged(await apiRequest<PagedResponse<PayrollPayslip>>(`/api/v1/payroll/my-payslips?page=${page}&pageSize=${pageSize}`))
}

// --- Components ------------------------------------------------------

export async function listComponents(): Promise<PayrollComponent[]> {
  return (await apiData<PayrollComponent[]>('/api/v1/payroll/components')) ?? []
}

export async function createComponent(input: Record<string, unknown>): Promise<PayrollComponent> {
  return apiData<PayrollComponent>('/api/v1/payroll/components', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateComponent(id: number, input: Record<string, unknown>): Promise<PayrollComponent> {
  return apiData<PayrollComponent>(`/api/v1/payroll/components/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// --- Salary structures ------------------------------------------------

export async function listStructures(employeeId?: number): Promise<SalaryStructure[]> {
  const query = employeeId ? `?employeeId=${employeeId}` : ''
  return (await apiData<SalaryStructure[]>(`/api/v1/payroll/salary-structures${query}`)) ?? []
}

export async function createStructure(input: Record<string, unknown>): Promise<SalaryStructure> {
  return apiData<SalaryStructure>('/api/v1/payroll/salary-structures', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateStructure(id: number, input: Record<string, unknown>): Promise<SalaryStructure> {
  return apiData<SalaryStructure>(`/api/v1/payroll/salary-structures/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// --- Client config ----------------------------------------------------

export async function getClientConfig(): Promise<ClientConfig | null> {
  return apiData<ClientConfig | null>('/api/v1/payroll/client-config')
}

export async function updateClientConfig(
  settings: Record<string, unknown>,
  effectiveFrom?: string,
): Promise<ClientConfig> {
  return apiData<ClientConfig>('/api/v1/payroll/client-config', {
    method: 'PATCH',
    body: JSON.stringify({ settings, effective_from: effectiveFrom }),
  })
}

// --- Parameters + jurisdictions ---------------------------------------

export async function listParameters(jurisdiction = 'MA', at?: string): Promise<ParametersResponse> {
  const query = new URLSearchParams({ jurisdiction })
  if (at) query.set('at', at)
  return apiData<ParametersResponse>(`/api/v1/payroll/parameters?${query}`)
}

export async function listJurisdictions(): Promise<JurisdictionRow[]> {
  return (await apiData<JurisdictionRow[]>('/api/v1/payroll/jurisdictions')) ?? []
}
