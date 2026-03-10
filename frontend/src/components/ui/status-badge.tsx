import { Badge } from './badge'
import type { JobStatus, ItemStatus, LogLevel } from '@/types'

const jobStatusConfig: Record<JobStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary' }> = {
  awaiting_payment: { label: 'Aguardando Pagamento', variant: 'warning' },
  pending: { label: 'Pendente', variant: 'secondary' },
  validating: { label: 'Validando', variant: 'info' },
  running: { label: 'Executando', variant: 'default' },
  paused: { label: 'Pausado', variant: 'warning' },
  completed: { label: 'Concluído', variant: 'success' },
  failed: { label: 'Falhou', variant: 'error' },
  cancelled: { label: 'Cancelado', variant: 'secondary' },
}

const itemStatusConfig: Record<ItemStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  success: { label: 'Sucesso', variant: 'success' },
  error: { label: 'Erro', variant: 'error' },
  skipped: { label: 'Pulado', variant: 'warning' },
  incompatible: { label: 'Incompatível', variant: 'error' },
}

const logLevelConfig: Record<LogLevel, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'secondary' }> = {
  debug: { label: 'DEBUG', variant: 'secondary' },
  info: { label: 'INFO', variant: 'info' },
  success: { label: 'OK', variant: 'success' },
  warning: { label: 'WARN', variant: 'warning' },
  error: { label: 'ERRO', variant: 'error' },
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = jobStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const config = itemStatusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function LogLevelBadge({ level }: { level: LogLevel }) {
  const config = logLevelConfig[level]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
