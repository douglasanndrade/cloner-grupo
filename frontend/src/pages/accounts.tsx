import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  UserPlus,
  Phone,
  Shield,
  Crown,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { accountsApi } from '@/services/api'
import type { TelegramAccount, LoginStep } from '@/types'

export function AccountsPage() {
  const [accounts, setAccounts] = useState<TelegramAccount[]>([])
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [loginStep, setLoginStep] = useState<LoginStep>('phone')
  const [loginForm, setLoginForm] = useState({
    phone: '',
    code: '',
    password: '',
  })
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [statusChecking, setStatusChecking] = useState<Record<number, boolean>>({})
  const [reconnecting, setReconnecting] = useState<Record<number, boolean>>({})

  const checkAllStatuses = (accountsList: TelegramAccount[]) => {
    for (const acc of accountsList) {
      setStatusChecking((prev) => ({ ...prev, [acc.id]: true }))
      accountsApi.checkStatus(acc.id)
        .then((statusRes) => {
          setAccounts((prev) =>
            prev.map((a) => a.id === acc.id ? { ...a, is_active: statusRes.data.is_active, is_premium: statusRes.data.is_premium } : a)
          )
        })
        .catch(() => {
          setAccounts((prev) =>
            prev.map((a) => a.id === acc.id ? { ...a, is_active: false } : a)
          )
        })
        .finally(() => {
          setStatusChecking((prev) => ({ ...prev, [acc.id]: false }))
        })
    }
  }

  useEffect(() => {
    accountsApi.list()
      .then((res) => {
        // Deduplicate by phone (keep the latest)
        const seen = new Map<string, TelegramAccount>()
        for (const acc of res.data) {
          const key = acc.phone.replace(/[\s\-+]/g, '')
          if (!seen.has(key) || acc.id > seen.get(key)!.id) {
            seen.set(key, acc)
          }
        }
        const unique = Array.from(seen.values())
        setAccounts(unique)
        checkAllStatuses(unique)
      })
      .catch(() => {})
  }, [])

  const handleReconnect = async (account: TelegramAccount) => {
    setReconnecting((prev) => ({ ...prev, [account.id]: true }))
    try {
      const statusRes = await accountsApi.checkStatus(account.id)
      setAccounts((prev) =>
        prev.map((a) => a.id === account.id ? { ...a, is_active: statusRes.data.is_active, is_premium: statusRes.data.is_premium } : a)
      )
      if (!statusRes.data.is_active) {
        // Session file is gone or invalid — need to re-login
        setLoginForm((prev) => ({ ...prev, phone: account.phone }))
        setShowLoginDialog(true)
      }
    } catch {
      // Failed to reconnect — open login dialog with phone pre-filled
      setLoginForm((prev) => ({ ...prev, phone: account.phone }))
      setShowLoginDialog(true)
    } finally {
      setReconnecting((prev) => ({ ...prev, [account.id]: false }))
    }
  }

  const handleStartLogin = async () => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await accountsApi.startLogin({
        phone: loginForm.phone,
      })
      setPhoneCodeHash(res.data.phone_code_hash)
      setLoginStep('code')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Erro ao iniciar login. Verifique se o API ID e Hash estão configurados em Configurações.')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleSubmitCode = async () => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await accountsApi.submitCode({
        phone: loginForm.phone,
        code: loginForm.code,
        phone_code_hash: phoneCodeHash,
      })
      if (res.data.step === '2fa') {
        setLoginStep('password')
      } else {
        setLoginStep('done')
        if (res.data.account) {
          setAccounts((prev) => [...prev, res.data.account!])
        }
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Código inválido')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleSubmit2FA = async () => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await accountsApi.submit2FA({
        phone: loginForm.phone,
        password: loginForm.password,
      })
      setAccounts((prev) => [...prev, res.data.account])
      setLoginStep('done')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Senha 2FA inválida')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleTogglePremium = async (account: TelegramAccount) => {
    try {
      const res = await accountsApi.togglePremium(account.id, !account.is_premium)
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? res.data : a))
      )
    } catch {
      // Fallback: toggle locally
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, is_premium: !a.is_premium } : a
        )
      )
    }
  }

  const handleRemoveAccount = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover esta conta?')) return
    try {
      await accountsApi.remove(id)
      setAccounts((prev) => prev.filter((a) => a.id !== id))
    } catch {
      setAccounts((prev) => prev.filter((a) => a.id !== id))
    }
  }

  const resetLoginDialog = () => {
    setShowLoginDialog(false)
    setLoginStep('phone')
    setLoginForm({ phone: '', code: '', password: '' })
    setLoginError('')
    setPhoneCodeHash('')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas Telegram</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as contas usadas para clonagem
          </p>
        </div>
        <Button onClick={() => setShowLoginDialog(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Adicionar Conta
        </Button>
      </div>

      {/* Premium info banner */}
      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">Sobre o limite de upload</p>
            <p className="text-muted-foreground mt-1">
              Contas Telegram comuns têm limite de <b>2 GB</b> por arquivo. Contas{' '}
              <b>Premium</b> suportam até <b>4 GB</b>. Se não for possível detectar
              automaticamente, configure manualmente o status Premium de cada conta.
              Isso impacta diretamente a compatibilidade no modo reupload.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Disconnected session alert */}
      {accounts.some((a) => !a.is_active && !statusChecking[a.id]) && (
        <Card className="border-error/30 bg-error/5">
          <CardContent className="flex items-start gap-3 p-4">
            <XCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-error">Sessao desconectada detectada</p>
              <p className="text-muted-foreground mt-1">
                {accounts.filter((a) => !a.is_active && !statusChecking[a.id]).map((a) => a.phone).join(', ')}{' '}
                — a sessao expirou ou foi desconectada. Clique em <b>Reconectar</b> para tentar restabelecer a conexao.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts List */}
      <div className="grid gap-4">
        {accounts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Phone className="h-12 w-12 text-muted mb-4" />
              <p className="text-lg font-medium text-foreground">Nenhuma conta conectada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Adicione uma conta Telegram para começar a clonar
              </p>
              <Button className="mt-4" onClick={() => setShowLoginDialog(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Adicionar Conta
              </Button>
            </CardContent>
          </Card>
        ) : (
          accounts.map((account) => (
            <Card key={account.id} className={`hover:border-border-hover transition-colors ${!account.is_active && !statusChecking[account.id] ? 'border-error/30 bg-error/5' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                      {account.first_name?.[0] || account.phone[0]}
                    </div>

                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">
                          {account.first_name} {account.last_name}
                        </p>
                        {account.is_premium && (
                          <Badge variant="warning" className="gap-1">
                            <Crown className="h-3 w-3" />
                            Premium
                          </Badge>
                        )}
                        {statusChecking[account.id] ? (
                          <Badge variant="secondary" className="gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Verificando...
                          </Badge>
                        ) : account.is_active ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Conectada
                          </Badge>
                        ) : (
                          <Badge variant="error" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Desconectada
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {account.phone}
                        {account.username && (
                          <span className="ml-2 text-muted">@{account.username}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Limite de upload: {account.is_premium ? '4 GB' : '2 GB'}
                        {' · '}
                        Adicionada em {new Date(account.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    {!account.is_active && !statusChecking[account.id] && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-error/30 text-error hover:bg-error/10"
                        onClick={() => handleReconnect(account)}
                        disabled={reconnecting[account.id]}
                      >
                        {reconnecting[account.id] ? (
                          <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        )}
                        Reconectar
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`premium-${account.id}`} className="text-xs">
                        Premium
                      </Label>
                      <Switch
                        id={`premium-${account.id}`}
                        checked={account.is_premium}
                        onCheckedChange={() => handleTogglePremium(account)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAccount(account.id)}
                    >
                      <Trash2 className="h-4 w-4 text-error" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Login Dialog - SIMPLIFIED: only phone → code → password */}
      <Dialog open={showLoginDialog} onOpenChange={(open) => !open && resetLoginDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {loginStep === 'phone' && 'Adicionar Conta Telegram'}
              {loginStep === 'code' && 'Código de Verificação'}
              {loginStep === 'password' && 'Senha 2FA'}
              {loginStep === 'done' && 'Conta Adicionada!'}
            </DialogTitle>
            <DialogDescription>
              {loginStep === 'phone' &&
                'Informe o número do telefone da conta Telegram'}
              {loginStep === 'code' &&
                'Um código foi enviado para o seu Telegram. Digite abaixo.'}
              {loginStep === 'password' &&
                'Sua conta tem verificação em duas etapas. Digite a senha.'}
              {loginStep === 'done' && 'Conta conectada com sucesso!'}
            </DialogDescription>
          </DialogHeader>

          {loginError && (
            <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              <XCircle className="h-4 w-4 shrink-0" />
              {loginError}
            </div>
          )}

          {/* STEP 1: Phone only */}
          {loginStep === 'phone' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Número do Telefone</Label>
                <Input
                  id="phone"
                  placeholder="+5511999999999"
                  className="text-lg"
                  value={loginForm.phone}
                  onChange={(e) => setLoginForm({ ...loginForm, phone: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && loginForm.phone && handleStartLogin()}
                />
                <p className="text-xs text-muted-foreground">
                  Com código do país, sem espaços. Ex: +5511999999999
                </p>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-surface rounded-lg p-3">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  O API ID e API Hash são configurados uma vez em{' '}
                  <Link to="/settings" className="text-primary font-medium hover:underline">
                    Configurações
                  </Link>
                  . Todas as contas usam as mesmas credenciais da API.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Code */}
          {loginStep === 'code' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Phone className="h-8 w-8 text-primary" />
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Código enviado para <span className="text-foreground font-medium">{loginForm.phone}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">Código</Label>
                <Input
                  id="code"
                  placeholder="12345"
                  maxLength={6}
                  autoFocus
                  className="text-center text-3xl tracking-[0.5em] font-mono"
                  value={loginForm.code}
                  onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value.replace(/\D/g, '') })}
                  onKeyDown={(e) => e.key === 'Enter' && loginForm.code && handleSubmitCode()}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Verifique o app do Telegram no celular ou desktop
              </p>
            </div>
          )}

          {/* STEP 3: 2FA Password */}
          {loginStep === 'password' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center py-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                  <Shield className="h-8 w-8 text-warning" />
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Esta conta tem verificação em duas etapas ativada
              </p>
              <div className="space-y-2">
                <Label htmlFor="password">Senha 2FA</Label>
                <Input
                  id="password"
                  type="password"
                  autoFocus
                  placeholder="Digite sua senha"
                  className="text-center text-lg"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && loginForm.password && handleSubmit2FA()}
                />
              </div>
            </div>
          )}

          {/* STEP 4: Done */}
          {loginStep === 'done' && (
            <div className="flex flex-col items-center py-6">
              <CheckCircle2 className="h-20 w-20 text-success mb-4" />
              <p className="text-lg font-medium text-foreground">Conta conectada!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Pronta para ser usada em jobs de clonagem
              </p>
            </div>
          )}

          <DialogFooter>
            {loginStep === 'phone' && (
              <Button
                className="w-full"
                onClick={handleStartLogin}
                disabled={loginLoading || !loginForm.phone}
              >
                {loginLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="mr-2 h-4 w-4" />
                )}
                Enviar Código
              </Button>
            )}
            {loginStep === 'code' && (
              <Button
                className="w-full"
                onClick={handleSubmitCode}
                disabled={loginLoading || !loginForm.code}
              >
                {loginLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Verificar Código
              </Button>
            )}
            {loginStep === 'password' && (
              <Button
                className="w-full"
                onClick={handleSubmit2FA}
                disabled={loginLoading || !loginForm.password}
              >
                {loginLoading ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="mr-2 h-4 w-4" />
                )}
                Entrar
              </Button>
            )}
            {loginStep === 'done' && (
              <Button className="w-full" onClick={resetLoginDialog}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
