import { useState, useEffect } from 'react'
import {
  Eye,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Shield,
  ShieldOff,
  Users,
  Copy,
  Coins,
  ArrowLeft,
  Pencil,
  X,
  ScrollText,
  Activity,
  DollarSign,
  TrendingUp,
  XCircle,
  Clock,
  Key,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { adminApi, pixApi } from '@/services/api'
import { cn } from '@/lib/utils'

interface AdminUser {
  id: number
  username: string
  is_admin: boolean
  credits_basic: number
  credits_standard: number
  credits_premium: number
  total_credits: number
  total_jobs: number
  active_jobs: number
  created_at: string | null
}

interface UserDetail {
  user: {
    id: number
    username: string
    is_admin: boolean
    credits_basic: number
    credits_standard: number
    credits_premium: number
    created_at: string | null
  }
  stats: {
    total_jobs: number
    active_jobs: number
    completed_jobs: number
    failed_jobs: number
    cancelled_jobs: number
    total_messages_processed: number
    total_errors: number
    total_skipped: number
    total_spent: number
    total_purchases: number
  }
  jobs: {
    id: number
    name: string
    source_title: string
    destination_title: string
    account_phone: string
    mode: string
    status: string
    total_messages: number
    processed_count: number
    error_count: number
    skipped_count: number
    incompatible_count: number
    progress: number
    created_at: string | null
    started_at: string | null
    finished_at: string | null
  }[]
  purchases: {
    id: number
    plan: string
    credits: number
    amount: number
    status: string
    customer_name: string | null
    customer_cpf: string | null
    created_at: string | null
    paid_at: string | null
  }[]
  recent_logs: {
    id: number
    job_id: number
    level: string
    message: string
    details: string | null
    created_at: string | null
  }[]
}

const statusColors: Record<string, string> = {
  running: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  completed: 'text-green-400 bg-green-400/10 border-green-400/30',
  failed: 'text-red-400 bg-red-400/10 border-red-400/30',
  cancelled: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
  paused: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  validating: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30',
}

const logLevelColors: Record<string, string> = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-400',
}

export function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // God-eye view
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create user dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [newCreditsBasic, setNewCreditsBasic] = useState('0')
  const [newCreditsStandard, setNewCreditsStandard] = useState('0')
  const [newCreditsPremium, setNewCreditsPremium] = useState('0')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit credits dialog
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editBasic, setEditBasic] = useState('')
  const [editStandard, setEditStandard] = useState('')
  const [editPremium, setEditPremium] = useState('')
  const [saving, setSaving] = useState(false)

  const [message, setMessage] = useState('')

  // Plans management
  const [plans, setPlans] = useState<Record<string, { name: string; description: string; amount: number; credits: number; active: boolean }>>({})
  const [plansLoading, setPlansLoading] = useState(false)
  const [showPlansDialog, setShowPlansDialog] = useState(false)
  const [editPlans, setEditPlans] = useState<Record<string, { name: string; description: string; amount: string; credits: string; active: boolean }>>({})

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminApi.listUsers()
      setUsers(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  const fetchPlans = async () => {
    try {
      const res = await pixApi.adminGetPlans()
      setPlans(res.data)
    } catch {}
  }

  useEffect(() => {
    fetchUsers()
    fetchPlans()
  }, [])

  const openPlansDialog = () => {
    const edit: typeof editPlans = {}
    for (const [key, plan] of Object.entries(plans)) {
      edit[key] = {
        name: plan.name,
        description: plan.description || '',
        amount: String(plan.amount),
        credits: String(plan.credits),
        active: plan.active !== false,
      }
    }
    setEditPlans(edit)
    setShowPlansDialog(true)
  }

  const handleSavePlans = async () => {
    setPlansLoading(true)
    try {
      const out: any = {}
      for (const [key, plan] of Object.entries(editPlans)) {
        out[key] = {
          name: plan.name,
          description: plan.description,
          amount: parseFloat(plan.amount) || 0,
          credits: parseInt(plan.credits) || 1,
          active: plan.active,
        }
      }
      await pixApi.adminUpdatePlans(out)
      setMessage('Planos atualizados!')
      setShowPlansDialog(false)
      fetchPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar planos')
    } finally {
      setPlansLoading(false)
    }
  }

  const updatePlanField = (key: string, field: string, value: any) => {
    setEditPlans((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  const openGodEye = async (userId: number) => {
    setSelectedUserId(userId)
    setLoadingDetail(true)
    setUserDetail(null)
    try {
      const res = await adminApi.getUser(userId)
      setUserDetail(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      setCreateError('Preencha todos os campos')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      await adminApi.createUser({
        username: newUsername.trim(),
        password: newPassword,
        is_admin: newIsAdmin,
        credits_basic: Number(newCreditsBasic) || 0,
        credits_standard: Number(newCreditsStandard) || 0,
        credits_premium: Number(newCreditsPremium) || 0,
      })
      setShowCreateDialog(false)
      setNewUsername('')
      setNewPassword('')
      setNewIsAdmin(false)
      setNewCreditsBasic('0')
      setNewCreditsStandard('0')
      setNewCreditsPremium('0')
      setMessage('Usuário criado com sucesso!')
      fetchUsers()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${username}"?`)) return
    try {
      await adminApi.deleteUser(userId)
      setMessage(`Usuário ${username} excluído`)
      if (selectedUserId === userId) {
        setSelectedUserId(null)
        setUserDetail(null)
      }
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir')
    }
  }

  const openEditCredits = (user: AdminUser) => {
    setEditingUser(user)
    setEditBasic(String(user.credits_basic))
    setEditStandard(String(user.credits_standard))
    setEditPremium(String(user.credits_premium))
  }

  const handleSaveCredits = async () => {
    if (!editingUser) return
    setSaving(true)
    try {
      await adminApi.updateUser(editingUser.id, {
        credits_basic: Number(editBasic),
        credits_standard: Number(editStandard),
        credits_premium: Number(editPremium),
      })
      setEditingUser(null)
      setMessage('Créditos atualizados!')
      fetchUsers()
      if (selectedUserId === editingUser.id) openGodEye(editingUser.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const toggleAdmin = async (user: AdminUser) => {
    try {
      await adminApi.updateUser(user.id, { is_admin: !user.is_admin })
      setMessage(`${user.username} ${!user.is_admin ? 'agora é admin' : 'não é mais admin'}`)
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar')
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // Clear messages after 4s
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(''), 4000)
      return () => clearTimeout(t)
    }
  }, [message])

  // ---- GOD-EYE VIEW ----
  if (selectedUserId && userDetail) {
    const u = userDetail.user
    const s = userDetail.stats

    const handleResetPassword = async () => {
      const newPw = prompt(`Nova senha para ${u.username}:`)
      if (!newPw || newPw.length < 6) { alert('Senha deve ter no mínimo 6 caracteres'); return }
      try {
        await adminApi.updateUser(u.id, { password: newPw })
        setMessage(`Senha de ${u.username} alterada!`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao resetar senha')
      }
    }

    const handleQuickCredits = async (field: string, amount: number) => {
      try {
        const current = (u as any)[field] || 0
        const update: any = {}
        update[field] = current + amount
        await adminApi.updateUser(u.id, update)
        // Update locally immediately
        setUserDetail((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            user: { ...prev.user, [field]: current + amount },
          }
        })
        setMessage(`+${amount} crédito adicionado!`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro')
      }
    }

    const planLabels: Record<string, { name: string; color: string }> = {
      basic: { name: 'Básico', color: 'text-green-400' },
      standard: { name: 'Standard', color: 'text-blue-400' },
      premium: { name: 'Premium', color: 'text-purple-400' },
    }

    const purchaseStatusLabel: Record<string, { text: string; color: string }> = {
      pending: { text: 'Aguardando', color: 'text-yellow-400' },
      completed: { text: 'Pago', color: 'text-green-400' },
      failed: { text: 'Falhou', color: 'text-red-400' },
      refunded: { text: 'Estornado', color: 'text-gray-400' },
    }

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedUserId(null); setUserDetail(null) }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">{u.username}</h1>
              {u.is_admin && <Badge variant="info">Admin</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              Membro desde {formatDate(u.created_at)} · ID: {u.id}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleResetPassword} title="Resetar senha">
              <Key className="mr-2 h-4 w-4" />
              Resetar Senha
            </Button>
            <Button variant="outline" size="sm" onClick={() => openGodEye(selectedUserId)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{message}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <Card><CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><Copy className="h-4 w-4 text-primary" /></div>
              <div><p className="text-xl font-bold">{s.total_jobs}</p><p className="text-[10px] text-muted-foreground">Total Jobs</p></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10"><Activity className="h-4 w-4 text-blue-400" /></div>
              <div><p className="text-xl font-bold">{s.active_jobs}</p><p className="text-[10px] text-muted-foreground">Ativos</p></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10"><CheckCircle2 className="h-4 w-4 text-green-400" /></div>
              <div><p className="text-xl font-bold">{s.completed_jobs}</p><p className="text-[10px] text-muted-foreground">Concluídos</p></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-400" /></div>
              <div><p className="text-xl font-bold">{s.failed_jobs}</p><p className="text-[10px] text-muted-foreground">Falhas</p></div>
            </div>
          </CardContent></Card>
          <Card><CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10"><TrendingUp className="h-4 w-4 text-emerald-400" /></div>
              <div><p className="text-xl font-bold">{s.total_messages_processed.toLocaleString('pt-BR')}</p><p className="text-[10px] text-muted-foreground">Mensagens</p></div>
            </div>
          </CardContent></Card>
        </div>

        {/* Credits + Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4" /> Créditos</CardTitle>
              <Button variant="outline" size="sm" onClick={() => openEditCredits({
                id: u.id, username: u.username, is_admin: u.is_admin,
                credits_basic: u.credits_basic, credits_standard: u.credits_standard,
                credits_premium: u.credits_premium, total_credits: u.credits_basic + u.credits_standard + u.credits_premium,
                total_jobs: s.total_jobs, active_jobs: s.active_jobs, created_at: u.created_at,
              })}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-center">
                <p className="text-3xl font-bold">{u.credits_basic}</p>
                <p className="text-xs text-muted-foreground mt-1">Básico</p>
                <Button variant="ghost" size="sm" className="mt-2 text-green-400 text-xs" onClick={() => handleQuickCredits('credits_basic', 1)}>
                  <Plus className="h-3 w-3 mr-1" />+1
                </Button>
              </div>
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-center">
                <p className="text-3xl font-bold">{u.credits_standard}</p>
                <p className="text-xs text-muted-foreground mt-1">Standard</p>
                <Button variant="ghost" size="sm" className="mt-2 text-blue-400 text-xs" onClick={() => handleQuickCredits('credits_standard', 1)}>
                  <Plus className="h-3 w-3 mr-1" />+1
                </Button>
              </div>
              <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 text-center">
                <p className="text-3xl font-bold">{u.credits_premium}</p>
                <p className="text-xs text-muted-foreground mt-1">Premium</p>
                <Button variant="ghost" size="sm" className="mt-2 text-purple-400 text-xs" onClick={() => handleQuickCredits('credits_premium', 1)}>
                  <Plus className="h-3 w-3 mr-1" />+1
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jobs with progress bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Jobs ({userDetail.jobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userDetail.jobs.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <Copy className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Este lead ainda não criou nenhum job</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userDetail.jobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-border p-4 hover:bg-surface-hover/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted">#{job.id}</span>
                          <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                          <Badge variant="outline" className={cn('text-[10px]', statusColors[job.status] || '')}>
                            {job.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] capitalize">{job.mode}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {job.source_title} → {job.destination_title} · {job.account_phone}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-lg font-bold font-mono text-foreground">{job.progress}%</p>
                      </div>
                    </div>
                    <Progress
                      value={job.progress}
                      className="h-2 mb-2"
                      indicatorClassName={
                        job.status === 'completed' ? 'bg-green-500' :
                        job.status === 'failed' ? 'bg-red-500' :
                        job.status === 'paused' ? 'bg-orange-400' :
                        job.status === 'running' ? 'bg-blue-500' : undefined
                      }
                    />
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>{job.processed_count.toLocaleString('pt-BR')}/{job.total_messages.toLocaleString('pt-BR')} msgs</span>
                      {job.error_count > 0 && <span className="text-red-400">{job.error_count} erros</span>}
                      {job.skipped_count > 0 && <span className="text-yellow-400">{job.skipped_count} pulados</span>}
                      {job.incompatible_count > 0 && <span className="text-orange-400">{job.incompatible_count} incomp.</span>}
                      <span className="ml-auto">{formatDate(job.created_at)}</span>
                      {job.finished_at && <span>→ {formatDate(job.finished_at)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Compras Pix ({s.total_purchases})
              {s.total_spent > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  Total: R$ {s.total_spent.toFixed(2).replace('.', ',')}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userDetail.purchases.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <DollarSign className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma compra via Pix</p>
              </div>
            ) : (
              <div className="space-y-2">
                {userDetail.purchases.map((p) => {
                  const plan = planLabels[p.plan] || { name: p.plan, color: 'text-gray-400' }
                  const pStatus = purchaseStatusLabel[p.status] || { text: p.status, color: 'text-gray-400' }
                  return (
                    <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-full bg-surface shrink-0')}>
                        <DollarSign className={cn('h-4 w-4', plan.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-medium', plan.color)}>{plan.name}</span>
                          <span className="text-xs text-muted-foreground">
                            R$ {p.amount.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {p.customer_name || '—'} · CPF: {p.customer_cpf || '—'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn('text-xs font-medium', pStatus.color)}>{pStatus.text}</span>
                        <p className="text-[10px] text-muted">{formatDate(p.paid_at || p.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              Logs Recentes ({userDetail.recent_logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userDetail.recent_logs.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <ScrollText className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm">Nenhum log registrado</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {userDetail.recent_logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface-hover">
                    <span className={cn('font-mono font-bold uppercase w-14 shrink-0', logLevelColors[log.level] || 'text-gray-400')}>
                      {log.level}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono">
                      J#{log.job_id}
                    </span>
                    <span className="text-foreground flex-1 break-all">{log.message}</span>
                    <span className="text-muted shrink-0">{formatDate(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- LOADING GOD-EYE ----
  if (selectedUserId && loadingDetail) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span>Carregando visão completa...</span>
      </div>
    )
  }

  // ---- USER LIST ----
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Painel Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie usuários e acompanhe toda a atividade
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Atualizar
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Usuário
          </Button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">Total Usuários</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-blue-400" />
              <div>
                <p className="text-2xl font-bold">{users.reduce((a, u) => a + u.active_jobs, 0)}</p>
                <p className="text-xs text-muted-foreground">Jobs Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Coins className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-2xl font-bold">{users.reduce((a, u) => a + u.total_credits, 0)}</p>
                <p className="text-xs text-muted-foreground">Créditos Totais</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4" /> Planos de Crédito</CardTitle>
              <CardDescription>Preços e configurações dos planos de crédito</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={openPlansDialog}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar Planos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(plans).map(([key, plan]) => (
              <div key={key} className={cn(
                'rounded-lg border p-4 text-center',
                !plan.active && 'opacity-50',
                key === 'basic' ? 'border-green-500/30 bg-green-500/5' :
                key === 'standard' ? 'border-blue-500/30 bg-blue-500/5' :
                'border-purple-500/30 bg-purple-500/5'
              )}>
                <p className="text-sm font-bold text-foreground">{plan.name}</p>
                <p className="text-2xl font-bold mt-1">R$ {plan.amount.toFixed(2).replace('.', ',')}</p>
                <p className="text-xs text-muted-foreground mt-1">{plan.credits} crédito(s)</p>
                <p className="text-[10px] text-muted mt-1">{plan.description}</p>
                {!plan.active && <Badge variant="secondary" className="mt-2">Desativado</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários</CardTitle>
          <CardDescription>Clique no olho para ver tudo que o lead faz</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">Nenhum usuário</p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-surface-hover transition-colors"
                >
                  {/* Avatar */}
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full shrink-0 font-bold text-sm',
                    user.is_admin ? 'bg-primary/15 text-primary' : 'bg-surface text-muted-foreground'
                  )}>
                    {user.username[0]?.toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{user.username}</span>
                      {user.is_admin && <Badge variant="info" className="text-[10px]">Admin</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {user.total_jobs} jobs · {user.active_jobs} ativos · Desde {formatDate(user.created_at)}
                    </p>
                  </div>

                  {/* Credits */}
                  <div className="hidden md:flex items-center gap-2 shrink-0">
                    <span className="text-xs text-green-400 font-mono">B:{user.credits_basic}</span>
                    <span className="text-xs text-blue-400 font-mono">S:{user.credits_standard}</span>
                    <span className="text-xs text-purple-400 font-mono">P:{user.credits_premium}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openGodEye(user.id)}
                      title="Ver tudo (God Eye)"
                      className="text-primary hover:text-primary hover:bg-primary/10"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditCredits(user)}
                      title="Editar créditos"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleAdmin(user)}
                      title={user.is_admin ? 'Remover admin' : 'Tornar admin'}
                    >
                      {user.is_admin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUser(user.id, user.username)}
                      title="Excluir"
                      className="text-muted hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      {showCreateDialog && (
        <Dialog open onOpenChange={() => setShowCreateDialog(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Usuário</DialogTitle>
              <DialogDescription>Crie uma nova conta de lead</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Usuário / Email</Label>
                <Input
                  placeholder="email@exemplo.com"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground">Créditos iniciais</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Básico</Label>
                  <Input type="number" value={newCreditsBasic} onChange={(e) => setNewCreditsBasic(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Standard</Label>
                  <Input type="number" value={newCreditsStandard} onChange={(e) => setNewCreditsStandard(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Premium</Label>
                  <Input type="number" value={newCreditsPremium} onChange={(e) => setNewCreditsPremium(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsAdmin}
                  onChange={(e) => setNewIsAdmin(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm">Acesso de administrador</span>
              </label>
              {createError && (
                <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {createError}
                </div>
              )}
              <Button onClick={handleCreateUser} disabled={creating} className="w-full">
                {creating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Criar Usuário
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Credits Dialog */}
      {editingUser && (
        <Dialog open onOpenChange={() => setEditingUser(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Créditos de {editingUser.username}</DialogTitle>
              <DialogDescription>Defina a quantidade de créditos</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Básico</Label>
                  <Input type="number" value={editBasic} onChange={(e) => setEditBasic(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Standard</Label>
                  <Input type="number" value={editStandard} onChange={(e) => setEditStandard(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Premium</Label>
                  <Input type="number" value={editPremium} onChange={(e) => setEditPremium(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSaveCredits} disabled={saving} className="w-full">
                {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Plans Dialog */}
      {showPlansDialog && (
        <Dialog open onOpenChange={() => setShowPlansDialog(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Planos de Crédito</DialogTitle>
              <DialogDescription>Altere preços, nomes e ative/desative planos</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {Object.entries(editPlans).map(([key, plan]) => (
                <div key={key} className={cn(
                  'rounded-lg border p-4 space-y-3',
                  key === 'basic' ? 'border-green-500/30' :
                  key === 'standard' ? 'border-blue-500/30' : 'border-purple-500/30'
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground capitalize">{key}</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-muted-foreground">{plan.active ? 'Ativo' : 'Desativado'}</span>
                      <input
                        type="checkbox"
                        checked={plan.active}
                        onChange={(e) => updatePlanField(key, 'active', e.target.checked)}
                        className="rounded"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input value={plan.name} onChange={(e) => updatePlanField(key, 'name', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Preço (R$)</Label>
                      <Input type="number" step="0.01" value={plan.amount} onChange={(e) => updatePlanField(key, 'amount', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Créditos por compra</Label>
                      <Input type="number" min="1" value={plan.credits} onChange={(e) => updatePlanField(key, 'credits', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Input value={plan.description} onChange={(e) => updatePlanField(key, 'description', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              <Button onClick={handleSavePlans} disabled={plansLoading} className="w-full">
                {plansLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Salvar Planos
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
