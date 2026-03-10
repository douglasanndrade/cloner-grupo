import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Copy,
  Plus,
  Search,
  ArrowRight,
  RefreshCw,
  Filter,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { JobStatusBadge } from '@/components/ui/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { jobsApi } from '@/services/api'
import type { MouseEvent } from 'react'
import { formatNumber } from '@/lib/utils'
import type { CloneJob, JobStatus } from '@/types'

// Mock data
const mockJobs: CloneJob[] = [
  {
    id: 1, name: 'Clone Canal Notícias', source_entity_id: 1, source_title: '@noticias_tech',
    destination_entity_id: 2, destination_title: '@backup_noticias', account_id: 1,
    account_phone: '+55 11 99999-0001', mode: 'forward', status: 'running',
    import_history: true, monitor_new: true, last_message_id: 4521,
    total_messages: 5000, processed_count: 4521, error_count: 3, skipped_count: 0,
    incompatible_count: 0, started_at: '2026-03-10T08:00:00Z', finished_at: null,
    created_at: '2026-03-10T07:55:00Z', updated_at: '2026-03-10T10:30:00Z',
    send_interval_ms: 1000, max_concurrency: 1, temp_directory: '/tmp/cloner',
    oversized_policy: 'skip', notes: null,
  },
  {
    id: 2, name: 'Backup Grupo Premium', source_entity_id: 3, source_title: '@grupo_premium',
    destination_entity_id: 4, destination_title: '@grupo_backup', account_id: 1,
    account_phone: '+55 11 99999-0001', mode: 'reupload', status: 'completed',
    import_history: true, monitor_new: false, last_message_id: 12000,
    total_messages: 12000, processed_count: 11950, error_count: 12, skipped_count: 8,
    incompatible_count: 30, started_at: '2026-03-09T14:00:00Z',
    finished_at: '2026-03-09T22:30:00Z', created_at: '2026-03-09T13:55:00Z',
    updated_at: '2026-03-09T22:30:00Z', send_interval_ms: 1500, max_concurrency: 1,
    temp_directory: '/tmp/cloner', oversized_policy: 'skip', notes: null,
  },
  {
    id: 3, name: 'Canal de Vídeos', source_entity_id: 5, source_title: '@videos_hd',
    destination_entity_id: 6, destination_title: '@videos_archive', account_id: 2,
    account_phone: '+55 11 99999-0002', mode: 'reupload', status: 'paused',
    import_history: true, monitor_new: true, last_message_id: 800,
    total_messages: 3200, processed_count: 800, error_count: 5, skipped_count: 2,
    incompatible_count: 15, started_at: '2026-03-10T06:00:00Z', finished_at: null,
    created_at: '2026-03-10T05:55:00Z', updated_at: '2026-03-10T09:15:00Z',
    send_interval_ms: 2000, max_concurrency: 1, temp_directory: '/tmp/cloner',
    oversized_policy: 'skip', notes: 'Pausado manualmente - muitos vídeos acima de 2GB',
  },
]

export function JobsPage() {
  const [jobs, setJobs] = useState<CloneJob[]>(mockJobs)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchJobs = () => {
    setLoading(true)
    jobsApi.list({ status: statusFilter === 'all' ? undefined : statusFilter })
      .then((res) => setJobs(res.data))
      .catch(() => {/* keep mock */})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchJobs()
  }, [statusFilter])

  const filteredJobs = jobs.filter((job) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        job.name.toLowerCase().includes(q) ||
        job.source_title.toLowerCase().includes(q) ||
        job.destination_title.toLowerCase().includes(q)
      )
    }
    return true
  })

  const handleDelete = async (e: MouseEvent, job: CloneJob) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Excluir o job "${job.name}"?\nTodos os itens e logs serão removidos.`)) return
    try {
      await jobsApi.delete(job.id)
      setJobs((prev) => prev.filter((j) => j.id !== job.id))
    } catch {
      // toast error
    }
  }

  const getProgressPercent = (job: CloneJob) => {
    if (job.total_messages === 0) return 0
    return Math.round((job.processed_count / job.total_messages) * 100)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Jobs de Clonagem</h1>
          <p className="text-sm text-muted-foreground">{jobs.length} jobs encontrados</p>
        </div>
        <Link to="/jobs/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Job
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Buscar por nome, origem ou destino..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="awaiting_payment">Aguardando Pagamento</SelectItem>
              <SelectItem value="running">Executando</SelectItem>
              <SelectItem value="paused">Pausado</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardContent>
      </Card>

      {/* Jobs List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Copy className="h-12 w-12 text-muted mb-4" />
              <p className="text-lg font-medium text-foreground">Nenhum job encontrado</p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery ? 'Tente outra busca' : 'Crie seu primeiro job de clonagem'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`}>
              <Card className="cursor-pointer transition-all hover:border-border-hover hover:bg-surface-hover/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Copy className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{job.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {job.source_title} → {job.destination_title}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      <Badge variant="outline" className="capitalize">{job.mode}</Badge>
                      {!['running', 'validating'].includes(job.status) && (
                        <button
                          onClick={(e) => handleDelete(e, job)}
                          className="p-1 rounded hover:bg-error/10 text-muted hover:text-error transition-colors"
                          title="Excluir job"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted" />
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {formatNumber(job.processed_count)} / {formatNumber(job.total_messages)} mensagens
                      </span>
                      <span className="font-medium text-foreground">{getProgressPercent(job)}%</span>
                    </div>
                    <Progress
                      value={getProgressPercent(job)}
                      indicatorClassName={
                        job.status === 'completed' ? 'bg-success' :
                        job.status === 'failed' ? 'bg-error' :
                        job.status === 'paused' ? 'bg-warning' : undefined
                      }
                    />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Erros: <span className="text-error">{job.error_count}</span></span>
                      <span>Pulados: <span className="text-warning">{job.skipped_count}</span></span>
                      <span>Incompatíveis: <span className="text-error">{job.incompatible_count}</span></span>
                      <span className="ml-auto">{job.account_phone}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
