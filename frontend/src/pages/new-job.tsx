import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Copy,
  Search,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Crown,
  Forward,
  Download,
  List,
  Users,
  Image,
  FileText,
  Link,
  AtSign,
  Shield,
  Replace,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { accountsApi, entitiesApi, jobsApi, authApi } from '@/services/api'
import type { TelegramAccount, TelegramEntity, CloneMode, ContentMode } from '@/types'
import { cn } from '@/lib/utils'

interface UserCredits {
  basic: number
  standard: number
  premium: number
}

interface TelegramDialog {
  id: number
  telegram_id: number
  title: string
  username: string | null
  type: string
  members_count: number | null
}

export function NewJobPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<TelegramAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [destError, setDestError] = useState('')

  // Pre-fill from query params (when coming from "Clonar Novamente")
  const prefillSource = searchParams.get('source') || ''
  const prefillDest = searchParams.get('dest') || ''
  const prefillFromMsg = searchParams.get('from_msg') || ''
  const isContinuation = !!prefillFromMsg

  // Form state
  const [name, setName] = useState(
    isContinuation ? `${searchParams.get('name') || ''} (continuação)` : (searchParams.get('name') || '')
  )
  const [sourceIdentifier, setSourceIdentifier] = useState(prefillSource)
  const [destIdentifier, setDestIdentifier] = useState(prefillDest)
  const [accountId, setAccountId] = useState<string>(searchParams.get('account_id') || '')
  const [mode, setMode] = useState<CloneMode>((searchParams.get('mode') as CloneMode) || 'reupload')
  const [sendInterval, setSendInterval] = useState(searchParams.get('interval') || '1000')
  const [maxConcurrency, setMaxConcurrency] = useState(searchParams.get('concurrency') || '1')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [contentMode, setContentMode] = useState<ContentMode>('original')
  const [linkReplaceUrl, setLinkReplaceUrl] = useState('')
  const [notes, setNotes] = useState(isContinuation ? `Continuação - a partir da msg #${prefillFromMsg}` : '')

  // Resolved entities
  const [resolvedSource, setResolvedSource] = useState<TelegramEntity | null>(null)
  const [resolvedDest, setResolvedDest] = useState<TelegramEntity | null>(null)
  const [resolvingSource, setResolvingSource] = useState(false)
  const [resolvingDest, setResolvingDest] = useState(false)

  // Group verification (message count + credit tier)
  const [verifyResult, setVerifyResult] = useState<{
    title: string; telegram_id: number; message_count: number;
    credit_tier: string; credit_tier_label: string;
  } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // Group picker
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([])
  const [loadingDialogs, setLoadingDialogs] = useState(false)
  const [dialogsError, setDialogsError] = useState('')
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [showDestPicker, setShowDestPicker] = useState(false)
  const [dialogSearch, setDialogSearch] = useState('')

  // User credits
  const [credits, setCredits] = useState<UserCredits>({ basic: 0, standard: 0, premium: 0 })

  const selectedAccount = accounts.find((a) => String(a.id) === accountId)

  const loadDialogs = async () => {
    if (!accountId) return
    setLoadingDialogs(true)
    setDialogsError('')
    try {
      const res = await accountsApi.listDialogs(Number(accountId))
      setDialogs(res.data)
    } catch (err) {
      setDialogsError(err instanceof Error ? err.message : 'Erro ao carregar grupos')
    } finally {
      setLoadingDialogs(false)
    }
  }

  const openSourcePicker = () => {
    if (dialogs.length === 0) loadDialogs()
    setDialogSearch('')
    setShowSourcePicker(true)
  }

  const openDestPicker = () => {
    if (dialogs.length === 0) loadDialogs()
    setDialogSearch('')
    setShowDestPicker(true)
  }

  const selectDialog = (d: TelegramDialog, target: 'source' | 'dest') => {
    const identifier = String(d.telegram_id)
    if (target === 'source') {
      setSourceIdentifier(identifier)
      setShowSourcePicker(false)
    } else {
      setDestIdentifier(identifier)
      setShowDestPicker(false)
    }
  }

  const filteredDialogs = dialogs.filter((d) => {
    const q = dialogSearch.toLowerCase()
    return d.title.toLowerCase().includes(q) ||
      (d.username && d.username.toLowerCase().includes(q)) ||
      String(d.telegram_id).includes(q)
  })

  useEffect(() => {
    accountsApi.list()
      .then((res) => setAccounts(res.data))
      .catch(() => {})
    authApi.me()
      .then((res) => setCredits({
        basic: res.data.credits_basic ?? 0,
        standard: res.data.credits_standard ?? 0,
        premium: res.data.credits_premium ?? 0,
      }))
      .catch(() => {})
  }, [])

  const handleResolveSource = async () => {
    if (!sourceIdentifier || !accountId) return
    setResolvingSource(true)
    setSourceError('')
    setResolvedSource(null)
    setVerifyResult(null)
    setVerifyError('')
    try {
      const res = await entitiesApi.resolve({
        identifier: sourceIdentifier,
        account_id: Number(accountId),
      })
      setResolvedSource(res.data)

      // Auto-verify group to count messages and show credit cost
      setVerifying(true)
      try {
        const vRes = await entitiesApi.verifyGroup({
          identifier: sourceIdentifier,
          account_id: Number(accountId),
        })
        setVerifyResult(vRes.data)
      } catch (vErr) {
        setVerifyError(vErr instanceof Error ? vErr.message : 'Erro ao verificar grupo')
      } finally {
        setVerifying(false)
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Erro ao resolver origem.')
    } finally {
      setResolvingSource(false)
    }
  }

  const handleResolveDest = async () => {
    if (!destIdentifier || !accountId) return
    setResolvingDest(true)
    setDestError('')
    setResolvedDest(null)
    try {
      const res = await entitiesApi.resolve({
        identifier: destIdentifier,
        account_id: Number(accountId),
      })
      setResolvedDest(res.data)
    } catch (err) {
      setDestError(err instanceof Error ? err.message : 'Erro ao resolver destino.')
    } finally {
      setResolvingDest(false)
    }
  }

  // Check if user has enough credits for the detected tier
  const requiredTier = verifyResult?.credit_tier as keyof UserCredits | undefined
  const hasEnoughCredits = requiredTier ? credits[requiredTier] >= 1 : false

  const handleCreate = async () => {
    if (!verifyResult) {
      setError('Verifique o grupo de origem antes de criar o job.')
      return
    }
    if (!hasEnoughCredits) {
      setError(`Créditos insuficientes. Você precisa de 1 crédito ${verifyResult.credit_tier_label}.`)
      return
    }

    setLoading(true)
    setError('')
    try {
      const jobRes = await jobsApi.create({
        name,
        source_identifier: sourceIdentifier,
        destination_identifier: destIdentifier,
        account_id: Number(accountId),
        mode,
        import_history: true,
        monitor_new: false,
        send_interval_ms: Number(sendInterval),
        max_concurrency: Number(maxConcurrency),
        temp_directory: '/tmp/cloner',
        oversized_policy: 'skip',
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        content_mode: contentMode,
        link_replace_url: contentMode === 'replace_links' ? linkReplaceUrl : undefined,
        notes: notes || undefined,
        credit_tier: verifyResult.credit_tier,
      })
      navigate(`/jobs/${jobRes.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar job.')
    } finally {
      setLoading(false)
    }
  }

  // Main form
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isContinuation ? 'Clonar Novamente' : 'Novo Job de Clonagem'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isContinuation
            ? `Continuação da clonagem de ${prefillSource} → ${prefillDest} (a partir da msg #${prefillFromMsg})`
            : 'Configure e inicie uma nova operação de clonagem'
          }
        </p>
      </div>

      {isContinuation && (
        <div className="flex items-start gap-3 rounded-lg bg-info/5 border border-info/20 p-4 text-sm text-info">
          <Info className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Continuação automática</p>
            <p className="text-xs mt-0.5 opacity-80">
              Os dados do job anterior foram preenchidos automaticamente. Este job vai clonar apenas as mensagens novas a partir da msg #{prefillFromMsg}.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-4 text-sm text-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Job</Label>
            <Input
              id="name"
              placeholder="Ex: Clone canal de vídeos"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account">Conta Telegram</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={String(account.id)}>
                    <div className="flex items-center gap-2">
                      <span>{account.phone}</span>
                      {account.first_name && (
                        <span className="text-muted-foreground">({account.first_name})</span>
                      )}
                      {account.is_premium && (
                        <Crown className="h-3 w-3 text-warning" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAccount && !selectedAccount.is_premium && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-3 text-xs text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Sua conta <b>não é Premium</b>. O limite de upload é de <b>2 GB por arquivo</b>.
                  Arquivos maiores que 2 GB serão pulados.
                </span>
              </div>
            )}
            {selectedAccount?.is_premium && (
              <p className="text-xs text-success">
                Conta Premium — limite de upload: 4 GB por arquivo
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Source & Destination */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origem e Destino</CardTitle>
          <CardDescription>
            Informe o ID do grupo/canal de origem e destino
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-info/5 border border-info/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-info shrink-0" />
              <p className="text-sm font-medium text-info">Como encontrar o ID do grupo/canal</p>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                <b>1.</b> Abra o Telegram Web:{' '}
                <span className="text-foreground font-mono">web.telegram.org</span>
              </p>
              <p>
                <b>2.</b> Entre no grupo/canal e veja o número na barra de endereço:
              </p>
              <div className="rounded bg-background/80 px-3 py-2 font-mono text-foreground">
                https://web.telegram.org/k/#<b className="text-primary">-3322669846</b>
              </div>
              <p>
                <b>3.</b> Copie o número e adicione <span className="font-mono text-primary font-bold">-100</span> na frente:
              </p>
              <div className="rounded bg-background/80 px-3 py-2 font-mono">
                <span className="text-muted">ID para usar:</span>{' '}
                <span className="text-success font-bold">-1003322669846</span>
              </div>
              <p>
                Você também pode usar <span className="font-mono text-foreground">@username</span> do canal se ele for público.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Origem (de onde clonar)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="-1003322669846 ou @canal"
                  value={sourceIdentifier}
                  onChange={(e) => setSourceIdentifier(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={openSourcePicker}
                  disabled={!accountId}
                  title="Selecionar grupo"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResolveSource}
                  disabled={resolvingSource || !sourceIdentifier || !accountId}
                  title="Verificar"
                >
                  {resolvingSource ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {sourceError && (
                <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-xs text-error">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {sourceError}
                </div>
              )}
              {resolvedSource && (
                <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 p-3">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-foreground">{resolvedSource.title}</p>
                    <p className="text-muted-foreground">
                      {resolvedSource.entity_type} · ID: {resolvedSource.telegram_id}
                      {resolvedSource.members_count && ` · ${resolvedSource.members_count} membros`}
                    </p>
                  </div>
                </div>
              )}
              {verifying && (
                <div className="flex items-center gap-2 rounded-lg bg-info/5 border border-info/20 p-3 text-xs text-info">
                  <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                  Contando mensagens do grupo...
                </div>
              )}
              {verifyResult && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Mensagens encontradas:</span>
                    <span className="text-sm font-bold text-foreground">{verifyResult.message_count.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Crédito necessário:</span>
                    <span className={`text-sm font-bold ${
                      verifyResult.credit_tier === 'basic' ? 'text-green-500' :
                      verifyResult.credit_tier === 'standard' ? 'text-blue-500' : 'text-purple-500'
                    }`}>
                      1x {verifyResult.credit_tier_label}
                    </span>
                  </div>
                </div>
              )}
              {verifyError && (
                <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 p-3 text-xs text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {verifyError}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Destino (para onde enviar)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="-1003587477730 ou @canal"
                  value={destIdentifier}
                  onChange={(e) => setDestIdentifier(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={openDestPicker}
                  disabled={!accountId}
                  title="Selecionar grupo"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleResolveDest}
                  disabled={resolvingDest || !destIdentifier || !accountId}
                  title="Verificar"
                >
                  {resolvingDest ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {destError && (
                <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-xs text-error">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {destError}
                </div>
              )}
              {resolvedDest && (
                <div className="flex items-center gap-2 rounded-lg bg-success/5 border border-success/20 p-3">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-foreground">{resolvedDest.title}</p>
                    <p className="text-muted-foreground">
                      {resolvedDest.entity_type} · ID: {resolvedDest.telegram_id}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clone Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modo de Clonagem</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div
              onClick={() => setMode('reupload')}
              className={cn(
                'cursor-pointer rounded-lg border-2 p-4 transition-all',
                mode === 'reupload'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-hover'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  mode === 'reupload' ? 'bg-primary/15' : 'bg-surface'
                )}>
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Download + Reupload</p>
                  <Badge variant={mode === 'reupload' ? 'success' : 'secondary'} className="mt-1">
                    Recomendado
                  </Badge>
                </div>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Cópia limpa, sem marca de encaminhamento</li>
                <li>Preserva legenda/caption</li>
                <li>Funciona mesmo se a origem bloquear forward</li>
                <li>Limite: {selectedAccount?.is_premium ? '4 GB' : '2 GB'} por arquivo</li>
              </ul>
            </div>

            <div
              onClick={() => setMode('forward')}
              className={cn(
                'cursor-pointer rounded-lg border-2 p-4 transition-all',
                mode === 'forward'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-hover'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  mode === 'forward' ? 'bg-primary/15' : 'bg-surface'
                )}>
                  <Forward className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Forward</p>
                  <Badge variant={mode === 'forward' ? 'info' : 'secondary'} className="mt-1">
                    Mais Rápido
                  </Badge>
                </div>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Mais rápido e leve</li>
                <li>Sem limite de tamanho de arquivo</li>
                <li>Mostra "Encaminhado de..." no destino</li>
                <li>Não funciona se a origem bloquear forward</li>
              </ul>
            </div>
          </div>

          {mode === 'reupload' && !selectedAccount?.is_premium && selectedAccount && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-3 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Conta não é Premium. Arquivos acima de <b>2 GB</b> serão pulados automaticamente.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interval">Intervalo entre envios (ms)</Label>
              <Input
                id="interval"
                type="number"
                min={100}
                value={sendInterval}
                onChange={(e) => setSendInterval(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: 1000ms para evitar bloqueio do Telegram
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="concurrency">Concorrência Máxima</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={5}
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: 1 para manter a ordem das mensagens
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <Label className="mb-2 block">Filtrar por Data (opcional)</Label>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dateFrom" className="text-xs">De</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateTo" className="text-xs">Até</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <Label className="mb-3 block">Modo de Conteúdo</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Escolha o que será copiado das mensagens
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {([
                { value: 'media_only' as ContentMode, icon: Image, label: 'Só Mídia', desc: 'Sem legendas/texto', color: 'text-orange-400' },
                { value: 'media_text' as ContentMode, icon: FileText, label: 'Mídia + Texto', desc: 'Remove links e @', color: 'text-blue-400' },
                { value: 'media_text_links' as ContentMode, icon: Link, label: 'Mídia + Texto + Links', desc: 'Remove apenas @', color: 'text-cyan-400' },
                { value: 'media_text_links_mentions' as ContentMode, icon: AtSign, label: 'Mídia + Texto + Links + @', desc: 'Copia tudo', color: 'text-green-400' },
                { value: 'original' as ContentMode, icon: Shield, label: 'Original', desc: 'Tudo preservado, sem alterações', color: 'text-primary' },
                { value: 'replace_links' as ContentMode, icon: Replace, label: 'Links Alteráveis', desc: 'Substitui links por outro', color: 'text-warning' },
              ]).map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setContentMode(opt.value)}
                  className={cn(
                    'cursor-pointer rounded-lg border-2 p-3 transition-all text-center',
                    contentMode === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-border-hover'
                  )}
                >
                  <opt.icon className={cn('h-5 w-5 mx-auto mb-1', opt.color)} />
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              ))}
            </div>
            {contentMode === 'replace_links' && (
              <div className="mt-3 space-y-2">
                <Label htmlFor="linkReplaceUrl">Link de substituição</Label>
                <Input
                  id="linkReplaceUrl"
                  placeholder="https://t.me/seucanal"
                  value={linkReplaceUrl}
                  onChange={(e) => setLinkReplaceUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Todos os links encontrados nas mensagens serão substituídos por este link
                </p>
              </div>
            )}
            {contentMode !== 'original' && mode === 'forward' && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-3 text-xs text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  No modo <b>Forward</b>, o conteúdo não pode ser modificado pois a mensagem é encaminhada como está.
                  Use o modo <b>Download + Reupload</b> para alterar o conteúdo.
                </span>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input
              id="notes"
              placeholder="Notas sobre este job..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Credits Balance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seus Créditos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className={cn(
              'rounded-lg border p-3',
              requiredTier === 'basic' ? (hasEnoughCredits ? 'border-green-500 bg-green-500/5' : 'border-error bg-error/5') : 'border-border'
            )}>
              <p className="text-2xl font-bold text-foreground">{credits.basic}</p>
              <p className="text-xs text-muted-foreground">Básico</p>
            </div>
            <div className={cn(
              'rounded-lg border p-3',
              requiredTier === 'standard' ? (hasEnoughCredits ? 'border-blue-500 bg-blue-500/5' : 'border-error bg-error/5') : 'border-border'
            )}>
              <p className="text-2xl font-bold text-foreground">{credits.standard}</p>
              <p className="text-xs text-muted-foreground">Standard</p>
            </div>
            <div className={cn(
              'rounded-lg border p-3',
              requiredTier === 'premium' ? (hasEnoughCredits ? 'border-purple-500 bg-purple-500/5' : 'border-error bg-error/5') : 'border-border'
            )}>
              <p className="text-2xl font-bold text-foreground">{credits.premium}</p>
              <p className="text-xs text-muted-foreground">Premium</p>
            </div>
          </div>
          {requiredTier && !hasEnoughCredits && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Créditos insuficientes! Você precisa de 1 crédito {verifyResult?.credit_tier_label} para este grupo.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary & Submit */}
      <Card className="border-primary/30">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Resumo</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Modo: <span className="text-foreground font-medium">{mode === 'forward' ? 'Forward' : 'Download + Reupload'}</span>
                </p>
                {selectedAccount && (
                  <p>
                    Conta: <span className="text-foreground">{selectedAccount.phone}</span>
                    {selectedAccount.is_premium ? ' (Premium, 4 GB)' : ' (Regular, 2 GB)'}
                  </p>
                )}
                <p>
                  Intervalo: <span className="text-foreground">{sendInterval}ms</span>
                </p>
                {verifyResult && (
                  <p>
                    Custo: <span className={cn(
                      'font-medium',
                      hasEnoughCredits ? 'text-success' : 'text-error'
                    )}>
                      1x {verifyResult.credit_tier_label}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleCreate}
              disabled={loading || !name || !sourceIdentifier || !destIdentifier || !accountId || !verifyResult || !hasEnoughCredits}
            >
              {loading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {!verifyResult ? 'Verifique a Origem' : !hasEnoughCredits ? 'Sem Créditos' : 'Criar Job'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Group Picker Dialog */}
      {(showSourcePicker || showDestPicker) && (
        <Dialog open onOpenChange={() => { setShowSourcePicker(false); setShowDestPicker(false) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Selecionar {showSourcePicker ? 'Origem' : 'Destino'}
              </DialogTitle>
              <DialogDescription>
                Grupos e canais da conta selecionada
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Input
                placeholder="Buscar por nome, @username ou ID..."
                value={dialogSearch}
                onChange={(e) => setDialogSearch(e.target.value)}
                autoFocus
              />

              {loadingDialogs && (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Carregando grupos...</span>
                </div>
              )}

              {dialogsError && (
                <div className="flex items-center gap-2 rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {dialogsError}
                </div>
              )}

              {!loadingDialogs && dialogs.length > 0 && (
                <ScrollArea className="h-[350px]">
                  <div className="space-y-1">
                    {filteredDialogs.map((d) => (
                      <button
                        key={d.telegram_id}
                        className="w-full flex items-center gap-3 rounded-lg p-3 text-left hover:bg-surface-hover transition-colors"
                        onClick={() => selectDialog(d, showSourcePicker ? 'source' : 'dest')}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                          {d.title[0] || '#'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{d.telegram_id}</span>
                            {d.username && <span className="ml-2">@{d.username}</span>}
                            {d.members_count && <span className="ml-2">{d.members_count.toLocaleString('pt-BR')} membros</span>}
                          </p>
                        </div>
                        <Badge variant={d.type === 'channel' ? 'info' : 'secondary'} className="shrink-0">
                          {d.type === 'channel' ? 'Canal' : 'Grupo'}
                        </Badge>
                      </button>
                    ))}
                    {filteredDialogs.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        Nenhum grupo encontrado
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}

              {!loadingDialogs && dialogs.length === 0 && !dialogsError && (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mb-2" />
                  <p className="text-sm">Nenhum grupo carregado</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={loadDialogs}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Carregar Grupos
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
