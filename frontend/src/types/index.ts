// ============================================================
// Telegram Accounts
// ============================================================

export interface TelegramAccount {
  id: number
  phone: string
  username: string | null
  first_name: string | null
  last_name: string | null
  is_premium: boolean
  is_active: boolean
  session_file: string
  created_at: string
  updated_at: string
  notes: string | null
}

export interface AccountLoginRequest {
  phone: string
}

export interface AccountLoginCodeRequest {
  phone: string
  code: string
  phone_code_hash: string
}

export interface AccountLogin2FARequest {
  phone: string
  password: string
}

export type LoginStep = 'phone' | 'code' | 'password' | 'done'

// ============================================================
// Telegram Entities (origin/destination)
// ============================================================

export interface TelegramEntity {
  id: number
  telegram_id: number
  title: string
  username: string | null
  entity_type: 'channel' | 'group' | 'supergroup' | 'chat' | 'user'
  members_count: number | null
  photo_url: string | null
  resolved_at: string
}

export interface ResolveEntityRequest {
  identifier: string // numeric ID, @username, or t.me/link
  account_id: number
}

// ============================================================
// Clone Jobs
// ============================================================

export type CloneMode = 'forward' | 'reupload'

export type ContentMode = 'media_only' | 'media_text' | 'media_text_links' | 'media_text_links_mentions' | 'original' | 'replace_links'

export type JobStatus =
  | 'awaiting_payment'
  | 'pending'
  | 'validating'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type OversizedPolicy = 'skip' | 'forward_instead' | 'fail'

export interface CloneJob {
  id: number
  name: string
  source_entity_id: number
  source_title: string
  source_telegram_id?: number
  destination_entity_id: number
  destination_title: string
  destination_telegram_id?: number
  account_id: number
  account_phone: string
  mode: CloneMode
  status: JobStatus
  import_history: boolean
  monitor_new: boolean
  last_message_id: number | null
  total_messages: number
  processed_count: number
  error_count: number
  skipped_count: number
  incompatible_count: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  send_interval_ms: number
  max_concurrency: number
  temp_directory: string
  oversized_policy: OversizedPolicy
  content_mode: ContentMode
  link_replace_url: string | null
  notes: string | null
}

export interface CreateJobRequest {
  name: string
  source_identifier: string
  destination_identifier: string
  account_id: number
  mode: CloneMode
  import_history: boolean
  monitor_new: boolean
  send_interval_ms: number
  max_concurrency: number
  temp_directory: string
  oversized_policy: OversizedPolicy
  date_from?: string
  date_to?: string
  content_mode?: ContentMode
  link_replace_url?: string
  notes?: string
  credit_tier?: string
}

// ============================================================
// Clone Job Items
// ============================================================

export type ItemStatus = 'pending' | 'success' | 'error' | 'skipped' | 'incompatible'

export interface CloneJobItem {
  id: number
  job_id: number
  source_message_id: number
  grouped_id: string | null
  media_type: string | null
  media_size: number | null
  status: ItemStatus
  error_message: string | null
  destination_message_id: number | null
  processed_at: string | null
  created_at: string
}

// ============================================================
// Logs
// ============================================================

export type LogLevel = 'info' | 'warning' | 'error' | 'debug' | 'success'

export interface LogEntry {
  id: number
  job_id: number | null
  level: LogLevel
  message: string
  details: string | null
  created_at: string
}

// ============================================================
// App Settings
// ============================================================

export interface AppSettings {
  telegram_api_id: string
  telegram_api_hash: string
  temp_directory: string
  log_retention_days: number
  max_concurrency: number
  default_send_interval_ms: number
  default_timeout_seconds: number
  max_retries: number
  retry_delay_seconds: number
  db_url: string
  worker_enabled: boolean
  syncpay_client_id: string
  syncpay_client_secret: string
  syncpay_webhook_url: string
}

// ============================================================
// Dashboard Stats
// ============================================================

export interface DashboardStats {
  active_jobs: number
  completed_jobs: number
  total_jobs: number
  total_messages_processed: number
  success_rate: number
  active_accounts: number
  recent_errors: LogEntry[]
  jobs_by_status: Record<JobStatus, number>
}

// ============================================================
// Preview / Compatibility
// ============================================================

export interface CompatibilityReport {
  total_messages: number
  total_with_media: number
  compatible_count: number
  incompatible_count: number
  incompatible_items: {
    message_id: number
    media_type: string
    size: number
    reason: string
  }[]
  estimated_download_size: number
}

// ============================================================
// Auth
// ============================================================

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  username: string
}

export interface AuthUser {
  id: number
  username: string
  created_at: string
}

// ============================================================
// Payments
// ============================================================

export interface ScanResult {
  job_id: number
  message_count: number
  plan: string
  plan_name: string
  amount: number
  amount_formatted: string
}

export interface CheckoutResult {
  checkout_url: string
  tracking_ref: string
  payment_id: number
}

export interface PaymentStatus {
  payment_id: number | null
  status: string
  plan: string
  amount_formatted: string
  job_status: string
}

// ============================================================
// API Response wrappers
// ============================================================

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}
