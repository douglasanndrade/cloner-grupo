import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Pause,
  Play,
  XCircle,
  RefreshCw,
  Download,
  Copy,
  Clock,
  Hash,
  AlertTriangle,
  CheckCircle2,
  Info,
  Wifi,
  WifiOff,
  RotateCcw,
  Trash2,
  CreditCard,
  DollarSign,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { JobStatusBadge, ItemStatusBadge, LogLevelBadge } from '@/components/ui/status-badge'
import { jobsApi, logsApi, paymentsApi, accountsApi } from '@/services/api'
import { useJobLogs } from '@/hooks/use-websocket'
import { formatNumber, formatBytes, formatDuration } from '@/lib/utils'
import type { CloneJob, CloneJobItem, LogEntry } from '@/types'

// Mock
const mockJob: CloneJob = {
  id: 1, name: 'Clone Canal Notícias', source_entity_id: 1, source_title: '@noticias_tech',
  destination_entity_id: 2, destination_title: '@backup_noticias', account_id: 1,
  account_phone: '+55 11 99999-0001', mode: 'forward', status: 'running',
  import_history: true, monitor_new: true, last_message_id: 4521,
  total_messages: 5000, processed_count: 4521, error_count: 3, skipped_count: 0,
  incompatible_count: 0, started_at: '2026-03-10T08:00:00Z', finished_at: null,
  created_at: '2026-03-10T07:55:00Z', updated_at: '2026-03-10T10:30:00Z',
  send_interval_ms: 1000, max_concurrency: 1, temp_directory: '/tmp/cloner',
  oversized_policy: 'skip', notes: null,
}

const mockItems: CloneJobItem[] = [
  { id: 1, job_id: 1, source_message_id: 4519, grouped_id: null, media_type: 'photo', media_size: 524288, status: 'success', error_message: null, destination_message_id: 1019, processed_at: '2026-03-10T10:29:00Z', created_at: '2026-03-10T10:29:00Z' },
  { id: 2, job_id: 1, source_message_id: 4520, grouped_id: 'album_123', media_type: 'video', media_size: 157286400, status: 'success', error_message: null, destination_message_id: 1020, processed_at: '2026-03-10T10:29:30Z', created_at: '2026-03-10T10:29:30Z' },
  { id: 3, job_id: 1, source_message_id: 4521, grouped_id: null, media_type: 'document', media_size: 2684354560, status: 'incompatible', error_message: 'Arquivo de 2.5 GB excede limite da conta (2 GB)', destination_message_id: null, processed_at: '2026-03-10T10:30:00Z', created_at: '2026-03-10T10:30:00Z' },
]

const mockLogs: LogEntry[] = [
  { id: 1, job_id: 1, level: 'info', message: 'Job iniciado — modo forward', details: null, created_at: '2026-03-10T08:00:00Z' },
  { id: 2, job_id: 1, level: 'success', message: 'Mensagem #4519 encaminhada com sucesso', details: null, created_at: '2026-03-10T10:29:00Z' },
  { id: 3, job_id: 1, level: 'success', message: 'Álbum (grouped_id: album_123) encaminhado — 3 itens', details: null, created_at: '2026-03-10T10:29:30Z' },
  { id: 4, job_id: 1, level: 'warning', message: 'FloodWaitError: aguardando 15s', details: 'telethon.errors.FloodWaitError', created_at: '2026-03-10T10:29:45Z' },
  { id: 5, job_id: 1, level: 'error', message: 'Mídia msg #4521 incompatível — 2.5 GB excede limite de 2 GB', details: null, created_at: '2026-03-10T10:30:00Z' },
]

export function JobDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = Number(id)
  const navigate = useNavigate()

  const [job, setJob] = useState<CloneJob>(mockJob)
  const [items, setItems] = useState<CloneJobItem[]>(mockItems)
  const [historicLogs, setHistoricLogs] = useState<LogEntry[]>(mockLogs)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectResult, setReconnectResult] = useState<'success' | 'failed' | null>(null)

  const { logs: realtimeLogs, connected } = useJobLogs(jobId)

  const allLogs = [...historicLogs, ...realtimeLogs]

  useEffect(() => {
    jobsApi.get(jobId).then((res) => setJob(res.data)).catch(() => {})
    jobsApi.items(jobId).then((res) => setItems(res.data)).catch(() => {})
    logsApi.list({ job_id: jobId, per_page: 100 }).then((res) => setHistoricLogs(res.data)).catch(() => {})
  }, [jobId])

  // Poll job + items + logs em tempo real enquanto tiver ativo
  useEffect(() => {
    if (!['running', 'validating', 'awaiting_payment', 'pending'].includes(job.status)) return
    const interval = setInterval(() => {
      jobsApi.get(jobId).then((res) => setJob(res.data)).catch(() => {})
      jobsApi.items(jobId).then((res) => setItems(res.data)).catch(() => {})
      logsApi.list({ job_id: jobId, per_page: 100 }).then((res) => setHistoricLogs(res.data)).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [jobId, job.status])

  const progressPercent = job.total_messages > 0
    ? Math.round((job.processed_count / job.total_messages) * 100)
    : 0

  const elapsed = job.started_at
    ? Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000)
    : 0

  const handleAction = async (action: 'pause' | 'resume' | 'cancel' | 'reprocess') => {
    setActionLoading(action)
    try {
      let res
      switch (action) {
        case 'pause': res = await jobsApi.pause(jobId); break
        case 'resume': res = await jobsApi.resume(jobId); break
        case 'cancel': res = await jobsApi.cancel(jobId); break
        case 'reprocess': res = await jobsApi.reprocessErrors(jobId); break
      }
      if (res) setJob(res.data)
    } catch {
      // toast error
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Tem certeza que deseja excluir o job "${job.name}"?\nTodos os itens e logs serão removidos permanentemente.`)) return
    setActionLoading('delete')
    try {
      await jobsApi.delete(jobId)
      navigate('/jobs')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir job')
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkPaid = async () => {
    if (!confirm('Confirmar pagamento manualmente? O job será liberado para execução.')) return
    setActionLoading('markPaid')
    try {
      await paymentsApi.markPaid(jobId)
      const res = await jobsApi.get(jobId)
      setJob(res.data)
    } catch {
      // toast error
    } finally {
      setActionLoading(null)
    }
  }

  const handleOpenCheckout = async () => {
    setActionLoading('checkout')
    try {
      const res = await paymentsApi.checkout(jobId)
      if (res.data.checkout_url) {
        window.open(res.data.checkout_url, '_blank')
      }
    } catch {
      // toast error
    } finally {
      setActionLoading(null)
    }
  }

  const handleReconnect = async () => {
    setReconnecting(true)
    setReconnectResult(null)
    try {
      const res = await accountsApi.checkStatus(job.account_id)
      if (res.data.is_active) {
        setReconnectResult('success')
      } else {
        setReconnectResult('failed')
      }
    } catch {
      setReconnectResult('failed')
    } finally {
      setReconnecting(false)
    }
  }

  const handleCloneAgain = () => {
    // Usa telegram_id numérico em vez do título pra garantir resolução correta
    const source = job.source_telegram_id ? String(job.source_telegram_id) : job.source_title
    const dest = job.destination_telegram_id ? String(job.destination_telegram_id) : job.destination_title
    const params = new URLSearchParams({
      name: job.name,
      source,
      dest,
      account_id: String(job.account_id),
      mode: job.mode,
      interval: String(job.send_interval_ms),
      concurrency: String(job.max_concurrency),
      ...(job.last_message_id ? { from_msg: String(job.last_message_id) } : {}),
    })
    navigate(`/jobs/new?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/jobs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-muted-foreground">#{job.id}</span>
              <h1 className="text-2xl font-bold text-foreground">{job.name}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {job.source_title}
              {job.source_telegram_id && <span className="font-mono text-xs ml-1">({job.source_telegram_id})</span>}
              {' → '}
              {job.destination_title}
              {job.destination_telegram_id && <span className="font-mono text-xs ml-1">({job.destination_telegram_id})</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.status === 'awaiting_payment' && (
            <>
              <Button onClick={handleOpenCheckout} disabled={!!actionLoading}>
                {actionLoading === 'checkout' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Pagar
              </Button>
              <Button variant="outline" onClick={handleMarkPaid} disabled={!!actionLoading}>
                {actionLoading === 'markPaid' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                Confirmar Manual
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={!!actionLoading}>
                {actionLoading === 'delete' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Excluir
              </Button>
            </>
          )}
          {job.status === 'running' && (
            <Button variant="warning" onClick={() => handleAction('pause')} disabled={!!actionLoading}>
              {actionLoading === 'pause' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
              Pausar
            </Button>
          )}
          {job.status === 'paused' && (
            <>
              <Button variant="outline" onClick={handleReconnect} disabled={reconnecting || !!actionLoading}>
                {reconnecting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                Reconectar
              </Button>
              <Button variant="success" onClick={() => handleAction('resume')} disabled={!!actionLoading}>
                {actionLoading === 'resume' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Continuar
              </Button>
            </>
          )}
          {(job.status === 'running' || job.status === 'paused') && (
            <Button variant="destructive" onClick={() => handleAction('cancel')} disabled={!!actionLoading}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          )}
          {(job.status === 'completed' || job.status === 'failed') && job.error_count > 0 && (
            <Button variant="outline" onClick={() => handleAction('reprocess')} disabled={!!actionLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reprocessar Erros
            </Button>
          )}
          {job.status === 'failed' && (
            <Button variant="outline" onClick={handleReconnect} disabled={reconnecting || !!actionLoading}>
              {reconnecting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
              Reconectar
            </Button>
          )}
          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
            <>
              <Button onClick={handleCloneAgain}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clonar Novamente
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={!!actionLoading}>
                {actionLoading === 'delete' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Excluir
              </Button>
            </>
          )}
          {job.status === 'pending' && (
            <Button variant="destructive" onClick={handleDelete} disabled={!!actionLoading}>
              {actionLoading === 'delete' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Awaiting payment banner */}
      {job.status === 'awaiting_payment' && (
        <div className="flex items-start gap-3 rounded-lg bg-warning/10 border border-warning/30 p-4 text-sm text-warning">
          <CreditCard className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Aguardando pagamento</p>
            <p className="text-xs mt-0.5 opacity-80">
              Este job será iniciado automaticamente assim que o pagamento for confirmado.
              {job.total_messages > 0 && ` ${job.total_messages.toLocaleString('pt-BR')} mensagens detectadas.`}
            </p>
          </div>
        </div>
      )}

      {/* Reconnect result banner */}
      {reconnectResult === 'success' && (
        <div className="flex items-start gap-3 rounded-lg bg-success/10 border border-success/30 p-4 text-sm text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Sessao reconectada com sucesso!</p>
            <p className="text-xs mt-0.5 opacity-80">
              Clique em "Continuar" para retomar o job de onde parou.
            </p>
          </div>
        </div>
      )}
      {reconnectResult === 'failed' && (
        <div className="flex items-start gap-3 rounded-lg bg-error/10 border border-error/30 p-4 text-sm text-error">
          <WifiOff className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Nao foi possivel reconectar</p>
            <p className="text-xs mt-0.5 opacity-80">
              A sessao expirou. Va ate <Link to="/accounts" className="underline font-medium">Contas</Link> e faca login novamente.
            </p>
          </div>
        </div>
      )}

      {/* Continuation info banner */}
      {job.last_message_id && job.status === 'pending' && (
        <div className="flex items-start gap-3 rounded-lg bg-info/5 border border-info/20 p-4 text-sm text-info">
          <RotateCcw className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Continuação automática</p>
            <p className="text-xs mt-0.5 opacity-80">
              Este job vai continuar a partir da mensagem #{job.last_message_id}, clonando apenas as mensagens novas desde a última execução.
            </p>
          </div>
        </div>
      )}

      {/* Progress Card */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Progresso Geral</span>
              <span className="text-2xl font-bold text-foreground">{progressPercent}%</span>
            </div>
            <Progress
              value={progressPercent}
              className="h-3"
              indicatorClassName={
                job.status === 'completed' ? 'bg-success' :
                job.status === 'failed' ? 'bg-error' :
                job.status === 'paused' ? 'bg-warning' : undefined
              }
            />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">{formatNumber(job.processed_count)}</p>
                <p className="text-xs text-muted-foreground">Processadas</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">{formatNumber(job.total_messages)}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-error">{formatNumber(job.error_count)}</p>
                <p className="text-xs text-muted-foreground">Erros</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-warning">{formatNumber(job.skipped_count)}</p>
                <p className="text-xs text-muted-foreground">Puladas</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-error">{formatNumber(job.incompatible_count)}</p>
                <p className="text-xs text-muted-foreground">Incompatíveis</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Tempo decorrido:</span>
              <span className="font-medium text-foreground">{formatDuration(elapsed)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Hash className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Último msg ID:</span>
              <span className="font-medium text-foreground">{job.last_message_id || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Copy className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Modo:</span>
              <Badge variant="outline" className="capitalize">{job.mode}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Intervalo:</span>
              <span className="font-medium text-foreground">{job.send_interval_ms}ms</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Concorrência:</span>
              <span className="font-medium text-foreground">{job.max_concurrency}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Conta:</span>
              <span className="font-medium text-foreground">{job.account_phone}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Início:</span>
              <span className="font-medium text-foreground">
                {job.started_at ? new Date(job.started_at).toLocaleString('pt-BR') : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Fim:</span>
              <span className="font-medium text-foreground">
                {job.finished_at ? new Date(job.finished_at).toLocaleString('pt-BR') : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-muted" />
              <span className="text-muted-foreground">Oversized:</span>
              <span className="font-medium text-foreground capitalize">{job.oversized_policy}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Logs, Items, Incompatible */}
      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs" className="gap-1.5">
            Logs
            <div className="flex items-center gap-1">
              {connected ? (
                <Wifi className="h-3 w-3 text-success" />
              ) : (
                <WifiOff className="h-3 w-3 text-muted" />
              )}
            </div>
          </TabsTrigger>
          <TabsTrigger value="items">
            Itens ({formatNumber(items.length)})
          </TabsTrigger>
          <TabsTrigger value="incompatible">
            Incompatíveis ({job.incompatible_count})
          </TabsTrigger>
        </TabsList>

        {/* Logs */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Logs em Tempo Real</CardTitle>
              <div className="flex items-center gap-2">
                {connected ? (
                  <Badge variant="success" className="gap-1"><Wifi className="h-3 w-3" /> Conectado</Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1"><WifiOff className="h-3 w-3" /> Desconectado</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-1 font-mono text-xs">
                  {allLogs.map((log) => (
                    <div
                      key={`${log.id}-${log.created_at}`}
                      className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-surface-hover"
                    >
                      <span className="text-muted shrink-0 w-[140px]">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>
                      <LogLevelBadge level={log.level} />
                      <span className="text-foreground flex-1">{log.message}</span>
                    </div>
                  ))}
                  {allLogs.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      Aguardando logs...
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Items */}
        <TabsContent value="items">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Itens Processados</CardTitle>
              <a href={jobsApi.exportErrors(jobId)} download>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-3 w-3" />
                  Exportar Erros CSV
                </Button>
              </a>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface text-muted-foreground">
                      <th className="text-left p-3 font-medium">Msg ID</th>
                      <th className="text-left p-3 font-medium">Tipo</th>
                      <th className="text-left p-3 font-medium">Tamanho</th>
                      <th className="text-left p-3 font-medium">Álbum</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Dest. ID</th>
                      <th className="text-left p-3 font-medium">Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-border hover:bg-surface-hover">
                        <td className="p-3 font-mono">{item.source_message_id}</td>
                        <td className="p-3">{item.media_type || 'texto'}</td>
                        <td className="p-3">{item.media_size ? formatBytes(item.media_size) : '—'}</td>
                        <td className="p-3 font-mono text-xs">{item.grouped_id || '—'}</td>
                        <td className="p-3"><ItemStatusBadge status={item.status} /></td>
                        <td className="p-3 font-mono">{item.destination_message_id || '—'}</td>
                        <td className="p-3 text-xs text-error max-w-[200px] truncate">
                          {item.error_message || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incompatible */}
        <TabsContent value="incompatible">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Itens Incompatíveis</CardTitle>
              <CardDescription>
                Arquivos que excedem o limite de upload da conta ({job.mode === 'forward' ? 'N/A no forward' : 'aplica-se ao reupload'})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {job.incompatible_count === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-success mb-2" />
                  <p className="text-sm">Nenhum item incompatível</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.filter((i) => i.status === 'incompatible').map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-error/20 bg-error/5 p-4">
                      <AlertTriangle className="h-5 w-5 text-error shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          Mensagem #{item.source_message_id}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.media_type} · {item.media_size ? formatBytes(item.media_size) : 'tamanho desconhecido'}
                        </p>
                        <p className="text-xs text-error mt-1">{item.error_message}</p>
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-info/5 border border-info/20 p-3 text-xs text-info">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Para clonar estes arquivos, considere usar uma conta Telegram Premium (limite de 4 GB)
                      ou utilize o modo forward quando disponível.
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
