import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Users,
  ArrowRight,
  TrendingUp,
  Copy,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LogLevelBadge, JobStatusBadge } from '@/components/ui/status-badge'
import { dashboardApi } from '@/services/api'
import { formatNumber } from '@/lib/utils'
import type { DashboardStats, JobStatus } from '@/types'

const COLORS: Record<JobStatus, string> = {
  awaiting_payment: '#f59e0b',
  running: '#6366f1',
  completed: '#22c55e',
  failed: '#ef4444',
  paused: '#f59e0b',
  pending: '#71717a',
  cancelled: '#71717a',
  validating: '#3b82f6',
}

// Mock data for initial display
const mockStats: DashboardStats = {
  active_jobs: 2,
  completed_jobs: 15,
  total_jobs: 20,
  total_messages_processed: 45230,
  success_rate: 97.5,
  active_accounts: 3,
  recent_errors: [
    { id: 1, job_id: 5, level: 'error', message: 'FloodWaitError: aguardando 45s antes de reenviar', details: null, created_at: '2026-03-10T10:30:00Z' },
    { id: 2, job_id: 3, level: 'warning', message: 'Mídia de 2.3 GB excede limite da conta (2 GB)', details: null, created_at: '2026-03-10T10:28:00Z' },
    { id: 3, job_id: 5, level: 'error', message: 'Falha no download: timeout após 30s', details: null, created_at: '2026-03-10T10:25:00Z' },
  ],
  jobs_by_status: {
    awaiting_payment: 0,
    pending: 1,
    validating: 0,
    running: 2,
    paused: 1,
    completed: 15,
    failed: 1,
    cancelled: 0,
  },
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(mockStats)
  const [_loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    dashboardApi.stats()
      .then((res) => setStats(res.data))
      .catch(() => {/* keep mock data */})
      .finally(() => setLoading(false))
  }, [])

  const pieData = Object.entries(stats.jobs_by_status)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: status,
      value: count,
      color: COLORS[status as JobStatus] || '#71717a',
    }))

  const barData = [
    { name: 'Processadas', value: stats.total_messages_processed, color: '#6366f1' },
    { name: 'Jobs Total', value: stats.total_jobs, color: '#8b5cf6' },
    { name: 'Concluídos', value: stats.completed_jobs, color: '#22c55e' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sistema de clonagem</p>
        </div>
        <Link to="/jobs/new">
          <Button>
            <Copy className="mr-2 h-4 w-4" />
            Novo Job
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Jobs Ativos</p>
                <p className="text-3xl font-bold text-foreground">{stats.active_jobs}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Concluídos</p>
                <p className="text-3xl font-bold text-foreground">{stats.completed_jobs}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
                <p className="text-3xl font-bold text-foreground">{stats.success_rate}%</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Contas Ativas</p>
                <p className="text-3xl font-bold text-foreground">{stats.active_accounts}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
                <Users className="h-6 w-6 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts & Recent */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Jobs by Status - Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                      color: '#fafafa',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 justify-center">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-muted-foreground capitalize">{entry.name}</span>
                  <span className="font-medium text-foreground">{entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Overview Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visão Geral</CardTitle>
            <CardDescription>{formatNumber(stats.total_messages_processed)} mensagens processadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 12 }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#12121a',
                      border: '1px solid #1e1e2e',
                      borderRadius: '8px',
                      color: '#fafafa',
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Errors */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Erros Recentes</CardTitle>
              <CardDescription>Últimos eventos de erro</CardDescription>
            </div>
            <Link to="/logs">
              <Button variant="ghost" size="sm">
                Ver todos <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              <div className="space-y-3">
                {stats.recent_errors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mb-2 text-success" />
                    <p className="text-sm">Nenhum erro recente</p>
                  </div>
                ) : (
                  stats.recent_errors.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      {log.level === 'error' ? (
                        <XCircle className="h-4 w-4 mt-0.5 text-error shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <LogLevelBadge level={log.level} />
                          {log.job_id && (
                            <Badge variant="outline">Job #{log.job_id}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{log.message}</p>
                        <p className="text-[10px] text-muted mt-1">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/jobs/new">
          <Card className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-surface-hover">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Copy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Criar Novo Job</p>
                <p className="text-xs text-muted-foreground">Iniciar nova clonagem</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/accounts">
          <Card className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-surface-hover">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                <Users className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="font-medium text-foreground">Gerenciar Contas</p>
                <p className="text-xs text-muted-foreground">Adicionar ou ver contas</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/jobs">
          <Card className="cursor-pointer transition-colors hover:border-primary/50 hover:bg-surface-hover">
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <Activity className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground">Ver Jobs</p>
                <p className="text-xs text-muted-foreground">Acompanhar progresso</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
