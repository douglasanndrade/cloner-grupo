import { useState, useEffect } from 'react'
import { Coins, RefreshCw, ShoppingCart, Search, AlertTriangle, Plus, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi, entitiesApi, accountsApi } from '@/services/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TelegramAccount } from '@/types'

interface Credits {
  basic: number
  standard: number
  premium: number
}

function AdminCreditManager({ onCreditsChanged }: { onCreditsChanged: () => void }) {
  const [targetUsername, setTargetUsername] = useState('')
  const [addBasic, setAddBasic] = useState('0')
  const [addStandard, setAddStandard] = useState('0')
  const [addPremium, setAddPremium] = useState('0')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleAddCredits = async () => {
    if (!targetUsername.trim()) {
      setError('Informe o usuário')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await authApi.addCredits({
        username: targetUsername.trim(),
        credits_basic: Number(addBasic) || 0,
        credits_standard: Number(addStandard) || 0,
        credits_premium: Number(addPremium) || 0,
      })
      setMessage(
        `Créditos atualizados! ${res.data.username}: B:${res.data.credits_basic} S:${res.data.credits_standard} P:${res.data.credits_premium}`
      )
      setAddBasic('0')
      setAddStandard('0')
      setAddPremium('0')
      onCreditsChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar créditos')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Usuário</Label>
        <Input
          placeholder="email ou username do usuário"
          value={targetUsername}
          onChange={(e) => setTargetUsername(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Básico</Label>
          <Input
            type="number"
            value={addBasic}
            onChange={(e) => setAddBasic(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Standard</Label>
          <Input
            type="number"
            value={addStandard}
            onChange={(e) => setAddStandard(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Premium</Label>
          <Input
            type="number"
            value={addPremium}
            onChange={(e) => setAddPremium(e.target.value)}
          />
        </div>
      </div>
      <Button onClick={handleAddCredits} disabled={saving} className="w-full">
        {saving ? (
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plus className="mr-2 h-4 w-4" />
        )}
        Adicionar Créditos
      </Button>
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
        </div>
      )}
    </div>
  )
}

export function CreditsPage() {
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

  useEffect(() => {
    fetchCredits()
    accountsApi.list().then((res) => setAccounts(res.data)).catch(() => {})
  }, [])

  const handleVerifyGroup = async () => {
    if (!verifyGroupId || !verifyAccountId) return
    setVerifying(true)
    setVerifyResult(null)
    setVerifyError('')
    try {
      const res = await entitiesApi.verifyGroup({
        identifier: verifyGroupId,
        account_id: Number(verifyAccountId),
      })
      setVerifyResult(res.data)
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Erro ao verificar grupo')
    } finally {
      setVerifying(false)
    }
  }

  const totalCredits = credits.basic + credits.standard + credits.premium

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Créditos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus créditos de clonagem
          </p>
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

      {/* Credit tiers */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Básico</CardTitle>
            <CardDescription>Grupos até 500 mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{credits.basic}</div>
            <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min((credits.basic / 50) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Standard</CardTitle>
            <CardDescription>Grupos de 501 a 1000 mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{credits.standard}</div>
            <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min((credits.standard / 50) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Premium</CardTitle>
            <CardDescription>Grupos com +1000 mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{credits.premium}</div>
            <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${Math.min((credits.premium / 50) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verify Group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verificar Grupo</CardTitle>
          <CardDescription>
            Informe o ID do grupo para saber quantas mensagens tem e qual crédito será usado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Conta Telegram</Label>
              <Select value={verifyAccountId} onValueChange={setVerifyAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
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
                <Input
                  placeholder="-1003322669846 ou @canal"
                  value={verifyGroupId}
                  onChange={(e) => setVerifyGroupId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyGroup()}
                />
                <Button
                  onClick={handleVerifyGroup}
                  disabled={verifying || !verifyGroupId || !verifyAccountId}
                >
                  {verifying ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Verificar
                </Button>
              </div>
            </div>
          </div>

          {verifyError && (
            <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {verifyError}
            </div>
          )}

          {verifyResult && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Grupo:</span>
                <span className="text-sm font-medium text-foreground">{verifyResult.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ID:</span>
                <span className="text-sm font-mono text-foreground">{verifyResult.telegram_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total de mensagens:</span>
                <span className="text-lg font-bold text-foreground">{verifyResult.message_count.toLocaleString('pt-BR')}</span>
              </div>
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Crédito necessário:</span>
                <span className={`text-sm font-bold ${
                  verifyResult.credit_tier === 'basic' ? 'text-green-500' :
                  verifyResult.credit_tier === 'standard' ? 'text-blue-500' : 'text-purple-500'
                }`}>
                  1x {verifyResult.credit_tier_label}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin: Manage Credits */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Gerenciar Créditos</CardTitle>
          </div>
          <CardDescription>
            Adicione ou defina créditos para um usuário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminCreditManager onCreditsChanged={fetchCredits} />
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Como Funcionam os Créditos</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Básico</strong> — 1 crédito por grupo com até 500 mensagens</li>
              <li><strong>Standard</strong> — 1 crédito por grupo de 501 a 1.000 mensagens</li>
              <li><strong>Premium</strong> — 1 crédito por grupo com mais de 1.000 mensagens</li>
            </ul>
            <p className="mt-3">
              O crédito é consumido automaticamente ao criar um novo job de clonagem.
              Verifique o grupo de origem para saber qual tipo de crédito será necessário.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
