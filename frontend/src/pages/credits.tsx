import { useState, useEffect, useRef } from 'react'
import {
  Coins, RefreshCw, Search, AlertTriangle, Plus, CheckCircle2,
  QrCode, Copy, Clock, ShoppingCart, History, Minus,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
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
import { authApi, entitiesApi, accountsApi, pixApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth-store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TelegramAccount } from '@/types'

interface Credits {
  basic: number
  standard: number
  premium: number
}

interface PixResult {
  purchase_id: number
  plan: string
  plan_name: string
  quantity: number
  credits: number
  amount: number
  amount_formatted: string
  pix_code: string
  identifier: string
  status: string
}

interface Purchase {
  id: number
  plan: string
  plan_name: string
  credits: number
  amount: number
  amount_formatted: string
  status: string
  created_at: string | null
  paid_at: string | null
}

// ---- Admin Credit Manager (only for admins) ----

function AdminCreditManager({ onCreditsChanged }: { onCreditsChanged: () => void }) {
  const [targetUsername, setTargetUsername] = useState('')
  const [addBasic, setAddBasic] = useState('0')
  const [addStandard, setAddStandard] = useState('0')
  const [addPremium, setAddPremium] = useState('0')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleAddCredits = async () => {
    if (!targetUsername.trim()) { setError('Informe o usuário'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      const res = await authApi.addCredits({
        username: targetUsername.trim(),
        credits_basic: Number(addBasic) || 0,
        credits_standard: Number(addStandard) || 0,
        credits_premium: Number(addPremium) || 0,
      })
      setMessage(`Créditos atualizados! ${res.data.username}: B:${res.data.credits_basic} S:${res.data.credits_standard} P:${res.data.credits_premium}`)
      setAddBasic('0'); setAddStandard('0'); setAddPremium('0')
      onCreditsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar créditos')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Usuário</Label>
        <Input placeholder="email ou username" value={targetUsername} onChange={(e) => setTargetUsername(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1"><Label className="text-xs">Básico</Label><Input type="number" value={addBasic} onChange={(e) => setAddBasic(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Standard</Label><Input type="number" value={addStandard} onChange={(e) => setAddStandard(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Premium</Label><Input type="number" value={addPremium} onChange={(e) => setAddPremium(e.target.value)} /></div>
      </div>
      <Button onClick={handleAddCredits} disabled={saving} className="w-full">
        {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Adicionar Créditos
      </Button>
      {message && <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}
      {error && <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
    </div>
  )
}

// ---- Main Page ----

export function CreditsPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const [credits, setCredits] = useState<Credits>({ basic: 0, standard: 0, premium: 0 })
  const [loading, setLoading] = useState(true)

  // Verify group
  const [accounts, setAccounts] = useState<TelegramAccount[]>([])
  const [verifyAccountId, setVerifyAccountId] = useState('')
  const [verifyGroupId, setVerifyGroupId] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    title: string; telegram_id: number; message_count: number;
    credit_tier: string; credit_tier_label: string;
  } | null>(null)
  const [verifyError, setVerifyError] = useState('')

  // Buy credits
  const [showBuyDialog, setShowBuyDialog] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState('')
  const [pixResult, setPixResult] = useState<PixResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Plans from API
  const [apiPlans, setApiPlans] = useState<{ id: string; name: string; description: string; amount: number; amount_formatted: string; credits: number }[]>([])

  // Purchase history
  const [purchases, setPurchases] = useState<Purchase[]>([])

  // Poll for payment confirmation
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchCredits = () => {
    setLoading(true)
    authApi.me()
      .then((res) => {
        setCredits({
          basic: res.data.credits_basic ?? 0,
          standard: res.data.credits_standard ?? 0,
          premium: res.data.credits_premium ?? 0,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const fetchPurchases = () => {
    pixApi.purchases().then((res) => setPurchases(res.data)).catch(() => {})
  }

  useEffect(() => {
    fetchCredits()
    fetchPurchases()
    pixApi.plans().then((res) => setApiPlans(res.data)).catch(() => {})
    accountsApi.list().then((res) => setAccounts(res.data)).catch(() => {})
  }, [])

  // Poll payment status when we have a pending pix
  useEffect(() => {
    if (!pixResult || pixResult.status !== 'pending') return
    pollRef.current = setInterval(async () => {
      try {
        const res = await pixApi.checkStatus(pixResult.purchase_id)
        if (res.data.status === 'completed') {
          setPixResult((prev) => prev ? { ...prev, status: 'completed' } : null)
          fetchCredits()
          fetchPurchases()
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {}
    }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pixResult])

  const handleVerifyGroup = async () => {
    if (!verifyGroupId || !verifyAccountId) return
    setVerifying(true); setVerifyResult(null); setVerifyError('')
    try {
      const res = await entitiesApi.verifyGroup({ identifier: verifyGroupId, account_id: Number(verifyAccountId) })
      setVerifyResult(res.data)
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Erro ao verificar grupo')
    } finally { setVerifying(false) }
  }

  const openBuyDialog = (plan: string) => {
    setSelectedPlan(plan)
    setQuantity(1)
    setPixResult(null)
    setBuyError('')
    setCopied(false)
    setShowBuyDialog(true)
  }

  const handleGeneratePix = async () => {
    setBuying(true)
    setBuyError('')
    try {
      const res = await pixApi.buy({ plan: selectedPlan, quantity })
      setPixResult(res.data)
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Erro ao gerar Pix')
    } finally { setBuying(false) }
  }

  const handleCopyPix = () => {
    if (pixResult?.pix_code) {
      navigator.clipboard.writeText(pixResult.pix_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  const closeBuyDialog = () => {
    setShowBuyDialog(false)
    if (pollRef.current) clearInterval(pollRef.current)
    if (pixResult?.status === 'completed') {
      fetchCredits()
      fetchPurchases()
    }
  }

  const totalCredits = credits.basic + credits.standard + credits.premium

  const planColors: Record<string, string> = {
    basic: 'border-green-500/30 bg-green-500/5 text-green-500',
    standard: 'border-blue-500/30 bg-blue-500/5 text-blue-500',
    premium: 'border-purple-500/30 bg-purple-500/5 text-purple-500',
  }

  // Build planInfo from API (dynamic prices)
  const defaultPlanInfo: Record<string, { name: string; desc: string; price: string; amount: number; color: string }> = {
    basic: { name: 'Básico', desc: 'Grupos até 500 msgs', price: 'R$ 0,00', amount: 0, color: 'green' },
    standard: { name: 'Standard', desc: 'Grupos 501-1000 msgs', price: 'R$ 0,00', amount: 0, color: 'blue' },
    premium: { name: 'Premium', desc: 'Grupos +1000 msgs', price: 'R$ 0,00', amount: 0, color: 'purple' },
  }
  const planInfo: Record<string, { name: string; desc: string; price: string; amount: number; color: string }> = { ...defaultPlanInfo }
  for (const p of apiPlans) {
    const colorMap: Record<string, string> = { basic: 'green', standard: 'blue', premium: 'purple' }
    planInfo[p.id] = {
      name: p.name,
      desc: p.description,
      price: p.amount_formatted,
      amount: p.amount,
      color: colorMap[p.id] || 'gray',
    }
  }

  const statusLabel: Record<string, { text: string; variant: 'success' | 'warning' | 'error' | 'secondary' }> = {
    pending: { text: 'Aguardando', variant: 'warning' },
    completed: { text: 'Pago', variant: 'success' },
    failed: { text: 'Falhou', variant: 'error' },
    refunded: { text: 'Estornado', variant: 'secondary' },
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Créditos</h1>
          <p className="text-sm text-muted-foreground">Compre e gerencie seus créditos de clonagem</p>
        </div>
        <Button variant="outline" onClick={fetchCredits} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Total */}
      <Card className="border-primary/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Créditos</p>
              <p className="text-3xl font-bold text-foreground">{totalCredits}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit tiers with buy buttons */}
      <div className="grid gap-4 md:grid-cols-3">
        {(['basic', 'standard', 'premium'] as const).map((plan) => {
          const info = planInfo[plan]
          const count = credits[plan]
          return (
            <Card key={plan}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{info.name}</CardTitle>
                <CardDescription>{info.desc}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-4xl font-bold text-foreground">{count}</div>
                <p className="text-xs text-muted-foreground">créditos disponíveis</p>
                <Separator />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openBuyDialog(plan)}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  Comprar — {info.price}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Verify Group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verificar Grupo</CardTitle>
          <CardDescription>Informe o ID do grupo para saber qual crédito será usado</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Conta Telegram</Label>
              <Select value={verifyAccountId} onValueChange={setVerifyAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.phone} {acc.first_name && `(${acc.first_name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID do Grupo/Canal</Label>
              <div className="flex gap-2">
                <Input placeholder="-1003322669846 ou @canal" value={verifyGroupId} onChange={(e) => setVerifyGroupId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleVerifyGroup()} />
                <Button onClick={handleVerifyGroup} disabled={verifying || !verifyGroupId || !verifyAccountId}>
                  {verifying ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Verificar
                </Button>
              </div>
            </div>
          </div>
          {verifyError && <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error"><AlertTriangle className="h-4 w-4 shrink-0" />{verifyError}</div>}
          {verifyResult && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Grupo:</span><span className="text-sm font-medium text-foreground">{verifyResult.title}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Mensagens:</span><span className="text-lg font-bold text-foreground">{verifyResult.message_count.toLocaleString('pt-BR')}</span></div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Crédito necessário:</span>
                <span className={cn('text-sm font-bold', verifyResult.credit_tier === 'basic' ? 'text-green-500' : verifyResult.credit_tier === 'standard' ? 'text-blue-500' : 'text-purple-500')}>
                  1x {verifyResult.credit_tier_label}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase History */}
      {purchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Histórico de Compras</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {purchases.map((p) => {
                const sl = statusLabel[p.status] || { text: p.status, variant: 'secondary' as const }
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <span className="text-sm font-medium text-foreground">{p.plan_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{p.amount_formatted}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={sl.variant}>{sl.text}</Badge>
                      <span className="text-xs text-muted">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin: Manage Credits */}
      {isAdmin && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><CardTitle className="text-base">Gerenciar Créditos (Admin)</CardTitle></div>
            <CardDescription>Adicione créditos manualmente para um usuário</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminCreditManager onCreditsChanged={fetchCredits} />
          </CardContent>
        </Card>
      )}

      {/* Buy Credits Dialog */}
      {showBuyDialog && (
        <Dialog open onOpenChange={closeBuyDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pixResult?.status === 'completed' ? 'Pagamento Confirmado!' : pixResult ? 'Pague via Pix' : `Comprar Crédito ${planInfo[selectedPlan]?.name}`}
              </DialogTitle>
              <DialogDescription>
                {pixResult?.status === 'completed'
                  ? 'Seu crédito já foi adicionado automaticamente.'
                  : pixResult
                    ? 'Copie o código Pix ou escaneie o QR Code'
                    : `1 crédito ${planInfo[selectedPlan]?.name} por ${planInfo[selectedPlan]?.price}`
                }
              </DialogDescription>
            </DialogHeader>

            {/* Payment confirmed */}
            {pixResult?.status === 'completed' && (
              <div className="flex flex-col items-center py-6">
                <CheckCircle2 className="h-16 w-16 text-success mb-4" />
                <p className="text-lg font-bold text-foreground">Pagamento confirmado!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {pixResult.credits}x crédito {pixResult.plan_name} adicionado
                </p>
                <Button className="mt-4 w-full" onClick={closeBuyDialog}>Fechar</Button>
              </div>
            )}

            {/* Step 1: Choose quantity */}
            {!pixResult && !buying && !buyError && (
              <div className="space-y-5">
                <div className="text-center p-4 rounded-lg bg-surface border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Quantos grupos você quer clonar?</p>
                  <div className="flex items-center justify-center gap-4 mt-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold text-foreground w-16 text-center">{quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.min(50, quantity + 1))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {quantity} crédito{quantity > 1 ? 's' : ''} {planInfo[selectedPlan]?.name}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Preço unitário:</span>
                    <span className="text-foreground">{planInfo[selectedPlan]?.price}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Quantidade:</span>
                    <span className="text-foreground">{quantity}x</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-bold">
                    <span className="text-foreground">Total:</span>
                    <span className="text-primary">
                      R$ {((planInfo[selectedPlan]?.amount || 0) * quantity).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>

                <Button onClick={handleGeneratePix} className="w-full" size="lg">
                  <QrCode className="mr-2 h-4 w-4" />
                  Gerar Pix
                </Button>
              </div>
            )}

            {/* Loading — generating pix */}
            {buying && !pixResult && (
              <div className="flex flex-col items-center py-8">
                <RefreshCw className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">Gerando Pix...</p>
              </div>
            )}

            {/* Error */}
            {buyError && !buying && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
                  <AlertTriangle className="h-4 w-4 shrink-0" />{buyError}
                </div>
                <Button variant="outline" className="w-full" onClick={() => { setBuyError(''); }}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
                </Button>
              </div>
            )}

            {/* Pix generated — QR Code + copy */}
            {pixResult && pixResult.status === 'pending' && (
              <div className="space-y-4">
                {/* QR Code */}
                <div className="flex flex-col items-center p-5 rounded-lg bg-white">
                  <QRCodeSVG
                    value={pixResult.pix_code}
                    size={220}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{pixResult.amount_formatted}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pixResult.credits || quantity}x Crédito {pixResult.plan_name}
                  </p>
                </div>

                {/* Copy paste */}
                <div className="space-y-2">
                  <Label className="text-xs">Pix Copia e Cola</Label>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={pixResult.pix_code}
                      className="w-full h-16 text-[10px] font-mono bg-surface border border-border rounded-lg p-2.5 text-foreground resize-none"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-1.5 right-1.5"
                      onClick={handleCopyPix}
                    >
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      <span className="ml-1.5 text-xs">{copied ? 'Copiado!' : 'Copiar'}</span>
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm text-warning">
                  <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                  Aguardando pagamento... Atualiza automaticamente.
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
