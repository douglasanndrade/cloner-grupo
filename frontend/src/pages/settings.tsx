import { useState, useEffect } from 'react'
import {
  Save,
  RefreshCw,
  Cpu,
  Shield,
  Send,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Coins,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { settingsApi, authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth-store'
import type { AppSettings } from '@/types'

const defaultSettings: AppSettings = {
  telegram_api_id: '',
  telegram_api_hash: '',
  temp_directory: '/tmp/cloner',
  log_retention_days: 30,
  max_concurrency: 1,
  default_send_interval_ms: 1000,
  default_timeout_seconds: 60,
  max_retries: 3,
  retry_delay_seconds: 5,
  db_url: '',
  worker_enabled: true,
  syncpay_client_id: '',
  syncpay_client_secret: '',
  syncpay_webhook_url: '',
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Account info
  const username = useAuthStore((s) => s.username)
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null)
  const [credits, setCredits] = useState({ basic: 0, standard: 0, premium: 0 })

  // Change password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [pwChanging, setPwChanging] = useState(false)
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    settingsApi.get()
      .then((res) => setSettings(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))

    authApi.me()
      .then((res) => {
        setAccountCreatedAt(res.data.created_at)
        setCredits({
          basic: res.data.credits_basic,
          standard: res.data.credits_standard,
          premium: res.data.credits_premium,
        })
      })
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await settingsApi.update(settings)
      setSettings(res.data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      // show error
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPwMessage(null)

    if (newPassword.length < 6) {
      setPwMessage({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: 'error', text: 'As senhas não coincidem' })
      return
    }

    setPwChanging(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setPwMessage({ type: 'success', text: 'Senha alterada com sucesso!' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setPwMessage({ type: 'error', text: err.message || 'Erro ao alterar senha' })
    } finally {
      setPwChanging(false)
    }
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Configurações gerais da aplicação
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="mr-2 h-4 w-4 text-success" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saved ? 'Salvo!' : 'Salvar'}
        </Button>
      </div>

      {/* Account */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Minha Conta</CardTitle>
          </div>
          <CardDescription>
            Informações da sua conta e alteração de senha
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Account info */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
                <User className="h-4 w-4 text-muted" />
                <span className="text-foreground">{username}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Conta criada em</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
                <Shield className="h-4 w-4 text-muted" />
                <span className="text-foreground">
                  {accountCreatedAt
                    ? new Date(accountCreatedAt).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Credits */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Meus Créditos</Label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface p-4 text-center space-y-1">
                <div className="text-2xl font-bold text-foreground">{credits.basic}</div>
                <div className="text-xs text-muted-foreground">Básico</div>
                <div className="text-xs text-muted-foreground">até 500 msgs</div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-center space-y-1">
                <div className="text-2xl font-bold text-foreground">{credits.standard}</div>
                <div className="text-xs text-muted-foreground">Standard</div>
                <div className="text-xs text-muted-foreground">501–1000 msgs</div>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-center space-y-1">
                <div className="text-2xl font-bold text-foreground">{credits.premium}</div>
                <div className="text-xs text-muted-foreground">Premium</div>
                <div className="text-xs text-muted-foreground">+1000 msgs</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Change password */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted" />
              <Label className="text-sm font-medium">Alterar Senha</Label>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="currentPw">Senha Atual</Label>
                <div className="relative">
                  <Input
                    id="currentPw"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newPw">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="newPw"
                      type={showNewPw ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                    >
                      {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPw">Confirmar Nova Senha</Label>
                  <Input
                    id="confirmPw"
                    type={showNewPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>
            </div>

            {pwMessage && (
              <div className={`rounded-lg p-3 text-sm ${
                pwMessage.type === 'success'
                  ? 'bg-success/10 text-success border border-success/20'
                  : 'bg-error/10 text-error border border-error/20'
              }`}>
                {pwMessage.text}
              </div>
            )}

            <Button
              onClick={handleChangePassword}
              disabled={pwChanging || !currentPassword || !newPassword || !confirmPassword}
              variant="outline"
            >
              {pwChanging ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Alterar Senha
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Telegram API */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Telegram API</CardTitle>
          </div>
          <CardDescription>
            Credenciais da API do Telegram — usadas para todas as contas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="apiId">API ID</Label>
              <Input
                id="apiId"
                placeholder="34587540"
                value={settings.telegram_api_id}
                onChange={(e) => update('telegram_api_id', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiHash">API Hash</Label>
              <Input
                id="apiHash"
                placeholder="34e845744628dcb26c8ddf0517c5fe2e"
                value={settings.telegram_api_hash}
                onChange={(e) => update('telegram_api_hash', e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-surface rounded-lg p-3">
            <Shield className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Essas credenciais são obtidas em <b>my.telegram.org</b>.
              Você configura uma vez e todas as contas adicionadas usam o mesmo API ID e Hash.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* SyncPay (Pix) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-success" />
            <CardTitle className="text-base">SyncPay (Pix)</CardTitle>
          </div>
          <CardDescription>
            Credenciais da API SyncPay para pagamentos via Pix
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="syncClientId">Client ID</Label>
              <Input
                id="syncClientId"
                placeholder="cadc17a6-3724-..."
                value={settings.syncpay_client_id}
                onChange={(e) => update('syncpay_client_id', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="syncClientSecret">Client Secret</Label>
              <Input
                id="syncClientSecret"
                type="password"
                placeholder="a89657d4-d09a-..."
                value={settings.syncpay_client_secret}
                onChange={(e) => update('syncpay_client_secret', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="syncWebhookUrl">Webhook URL (público)</Label>
            <Input
              id="syncWebhookUrl"
              placeholder="https://seudominio.com/api/webhooks/syncpay"
              value={settings.syncpay_webhook_url}
              onChange={(e) => update('syncpay_webhook_url', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              URL pública onde a SyncPay envia a confirmação de pagamento. Endpoint: <code>/api/webhooks/syncpay</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-accent" />
            <CardTitle className="text-base">Desempenho</CardTitle>
          </div>
          <CardDescription>
            Limites de concorrência, intervalos e retries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Concorrência Máxima Padrão</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.max_concurrency}
                onChange={(e) => update('max_concurrency', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Intervalo de Envio Padrão (ms)</Label>
              <Input
                type="number"
                min={100}
                value={settings.default_send_interval_ms}
                onChange={(e) => update('default_send_interval_ms', Number(e.target.value))}
              />
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Timeout Padrão (s)</Label>
              <Input
                type="number"
                min={10}
                value={settings.default_timeout_seconds}
                onChange={(e) => update('default_timeout_seconds', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Retries</Label>
              <Input
                type="number"
                min={0}
                value={settings.max_retries}
                onChange={(e) => update('max_retries', Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Delay entre Retries (s)</Label>
              <Input
                type="number"
                min={1}
                value={settings.retry_delay_seconds}
                onChange={(e) => update('retry_delay_seconds', Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
