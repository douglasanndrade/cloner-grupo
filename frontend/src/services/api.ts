import type {
  TelegramAccount,
  AccountLoginRequest,
  AccountLoginCodeRequest,
  AccountLogin2FARequest,
  ResolveEntityRequest,
  TelegramEntity,
  CloneJob,
  CreateJobRequest,
  CloneJobItem,
  LogEntry,
  AppSettings,
  DashboardStats,
  CompatibilityReport,
  LoginRequest,
  LoginResponse,
  ScanResult,
  CheckoutResult,
  PaymentStatus,
  ApiResponse,
  PaginatedResponse,
} from '@/types'

const BASE_URL = (import.meta.env.VITE_API_URL || '') + '/api'

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('cloner-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.state?.token || null
    }
  } catch {}
  return null
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const token = getAuthToken()
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  }

  const response = await fetch(url, config)

  if (response.status === 401) {
    // Token expirado ou inválido - limpar auth
    localStorage.removeItem('cloner-auth')
    window.location.href = '/login'
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erro de conexão com o servidor' }))
    throw new Error(error.detail || `Erro ${response.status}`)
  }

  return response.json()
}

// ============================================================
// Auth
// ============================================================

export const authApi = {
  login: (data: LoginRequest) =>
    request<ApiResponse<{ token: string; username: string; is_admin: boolean }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  register: (data: { username: string; password: string; name?: string }) =>
    request<ApiResponse<{ token: string; username: string; is_admin: boolean }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () =>
    request<ApiResponse<{ username: string; is_admin: boolean; created_at: string | null; credits_basic: number; credits_standard: number; credits_premium: number }>>('/auth/me'),

  setCredits: (data: { username: string; credits_basic?: number; credits_standard?: number; credits_premium?: number }) =>
    request<ApiResponse<any>>('/auth/set-credits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<ApiResponse<null>>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  addCredits: (data: { username: string; credits_basic: number; credits_standard: number; credits_premium: number }) =>
    request<ApiResponse<{ username: string; credits_basic: number; credits_standard: number; credits_premium: number }>>('/auth/add-credits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ============================================================
// Accounts
// ============================================================

export const accountsApi = {
  list: () =>
    request<ApiResponse<TelegramAccount[]>>('/accounts'),

  get: (id: number) =>
    request<ApiResponse<TelegramAccount>>(`/accounts/${id}`),

  startLogin: (data: AccountLoginRequest) =>
    request<ApiResponse<{ phone_code_hash: string; step: string }>>('/accounts/login/start', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // API ID e Hash vêm das configurações do app, não do login

  submitCode: (data: AccountLoginCodeRequest) =>
    request<ApiResponse<{ step: string; account?: TelegramAccount }>>('/accounts/login/code', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  submit2FA: (data: AccountLogin2FARequest) =>
    request<ApiResponse<{ account: TelegramAccount }>>('/accounts/login/2fa', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  togglePremium: (id: number, isPremium: boolean) =>
    request<ApiResponse<TelegramAccount>>(`/accounts/${id}/premium`, {
      method: 'PATCH',
      body: JSON.stringify({ is_premium: isPremium }),
    }),

  remove: (id: number) =>
    request<ApiResponse<null>>(`/accounts/${id}`, {
      method: 'DELETE',
    }),

  checkStatus: (id: number) =>
    request<ApiResponse<{ is_active: boolean; is_premium: boolean }>>(`/accounts/${id}/status`),

  listDialogs: (id: number) =>
    request<ApiResponse<{ id: number; telegram_id: number; title: string; username: string | null; type: string; members_count: number | null }[]>>(`/accounts/${id}/dialogs`),
}

// ============================================================
// Entities
// ============================================================

export const entitiesApi = {
  resolve: (data: ResolveEntityRequest) =>
    request<ApiResponse<TelegramEntity>>('/entities/resolve', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  list: () =>
    request<ApiResponse<TelegramEntity[]>>('/entities'),

  verifyGroup: (data: { identifier: string; account_id: number }) =>
    request<ApiResponse<{ title: string; telegram_id: number; message_count: number; credit_tier: string; credit_tier_label: string }>>('/entities/verify-group', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ============================================================
// Jobs
// ============================================================

export const jobsApi = {
  list: (params?: { status?: string; page?: number; per_page?: number }) => {
    const search = new URLSearchParams()
    if (params?.status) search.set('status', params.status)
    if (params?.page) search.set('page', String(params.page))
    if (params?.per_page) search.set('per_page', String(params.per_page))
    const qs = search.toString()
    return request<PaginatedResponse<CloneJob>>(`/jobs${qs ? `?${qs}` : ''}`)
  },

  get: (id: number) =>
    request<ApiResponse<CloneJob>>(`/jobs/${id}`),

  create: (data: CreateJobRequest) =>
    request<ApiResponse<CloneJob>>('/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  pause: (id: number) =>
    request<ApiResponse<CloneJob>>(`/jobs/${id}/pause`, { method: 'POST' }),

  resume: (id: number) =>
    request<ApiResponse<CloneJob>>(`/jobs/${id}/resume`, { method: 'POST' }),

  cancel: (id: number) =>
    request<ApiResponse<CloneJob>>(`/jobs/${id}/cancel`, { method: 'POST' }),

  reprocessErrors: (id: number) =>
    request<ApiResponse<CloneJob>>(`/jobs/${id}/reprocess-errors`, { method: 'POST' }),

  cloneAgain: (id: number) =>
    request<ApiResponse<CloneJob>>(`/jobs/${id}/clone-again`, { method: 'POST' }),

  delete: (id: number) =>
    request<ApiResponse<null>>(`/jobs/${id}`, { method: 'DELETE' }),

  preview: (data: CreateJobRequest) =>
    request<ApiResponse<CompatibilityReport>>('/jobs/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  items: (jobId: number, params?: { status?: string; page?: number; per_page?: number }) => {
    const search = new URLSearchParams()
    if (params?.status) search.set('status', params.status)
    if (params?.page) search.set('page', String(params.page))
    if (params?.per_page) search.set('per_page', String(params.per_page))
    const qs = search.toString()
    return request<PaginatedResponse<CloneJobItem>>(`/jobs/${jobId}/items${qs ? `?${qs}` : ''}`)
  },

  exportErrors: (jobId: number) =>
    `${BASE_URL}/jobs/${jobId}/export-errors`,
}

// ============================================================
// Logs
// ============================================================

export const logsApi = {
  list: (params?: {
    job_id?: number
    level?: string
    from_date?: string
    to_date?: string
    page?: number
    per_page?: number
  }) => {
    const search = new URLSearchParams()
    if (params?.job_id) search.set('job_id', String(params.job_id))
    if (params?.level) search.set('level', params.level)
    if (params?.from_date) search.set('from_date', params.from_date)
    if (params?.to_date) search.set('to_date', params.to_date)
    if (params?.page) search.set('page', String(params.page))
    if (params?.per_page) search.set('per_page', String(params.per_page))
    const qs = search.toString()
    return request<PaginatedResponse<LogEntry>>(`/logs${qs ? `?${qs}` : ''}`)
  },
}

// ============================================================
// Payments
// ============================================================

export const paymentsApi = {
  scan: (jobId: number) =>
    request<ApiResponse<ScanResult>>(`/payments/${jobId}/scan`, { method: 'POST' }),

  checkout: (jobId: number) =>
    request<ApiResponse<CheckoutResult>>(`/payments/${jobId}/checkout`, { method: 'POST' }),

  status: (jobId: number) =>
    request<ApiResponse<PaymentStatus>>(`/payments/${jobId}/status`),

  markPaid: (jobId: number) =>
    request<ApiResponse<null>>(`/payments/${jobId}/mark-paid`, { method: 'POST' }),
}

// ============================================================
// Pix (Credit Purchase)
// ============================================================

export const pixApi = {
  plans: () =>
    request<ApiResponse<any[]>>('/pix/plans'),

  buy: (data: { plan: string; quantity?: number }) =>
    request<ApiResponse<any>>('/pix/buy', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  purchases: () =>
    request<ApiResponse<any[]>>('/pix/purchases'),

  checkStatus: (purchaseId: number) =>
    request<ApiResponse<any>>(`/pix/purchases/${purchaseId}/status`),

  adminGetPlans: () =>
    request<ApiResponse<any>>('/pix/admin/plans'),

  adminUpdatePlans: (plans: any) =>
    request<ApiResponse<any>>('/pix/admin/plans', {
      method: 'POST',
      body: JSON.stringify({ plans }),
    }),
}

// ============================================================
// Admin
// ============================================================

export const adminApi = {
  listUsers: () =>
    request<ApiResponse<any[]>>('/admin/users'),

  getUser: (userId: number) =>
    request<ApiResponse<any>>(`/admin/users/${userId}`),

  createUser: (data: { username: string; password: string; is_admin?: boolean; credits_basic?: number; credits_standard?: number; credits_premium?: number }) =>
    request<ApiResponse<any>>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (userId: number, data: { password?: string; is_admin?: boolean; credits_basic?: number; credits_standard?: number; credits_premium?: number }) =>
    request<ApiResponse<any>>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteUser: (userId: number) =>
    request<ApiResponse<null>>(`/admin/users/${userId}`, {
      method: 'DELETE',
    }),
}

// ============================================================
// Dashboard
// ============================================================

export const dashboardApi = {
  stats: () =>
    request<ApiResponse<DashboardStats>>('/dashboard/stats'),
}

// ============================================================
// Settings
// ============================================================

export const settingsApi = {
  get: () =>
    request<ApiResponse<AppSettings>>('/settings'),

  update: (data: Partial<AppSettings>) =>
    request<ApiResponse<AppSettings>>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}
