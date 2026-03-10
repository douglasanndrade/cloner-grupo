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
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { accountsApi, entitiesApi, jobsApi } from '@/services/api'
import type { TelegramAccount, TelegramEntity, CloneMode } from '@/types'
import { cn } from '@/lib/utils'

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
  const [notes, setNotes] = useState(isContinuation ? `Continuação - a partir da msg #${prefillFromMsg}` : '')

  // Resolved entities
  const [resolvedSource, setResolvedSource] = useState<TelegramEntity | null>(null)
  const [resolvedDest, setResolvedDest] = useState<TelegramEntity | null>(null)
  const [resolvingSource, setResolvingSource] = useState(false)
  const [resolvingDest, setResolvingDest] = useState(false)

  const selectedAccount = accounts.find((a) => String(a.id) === accountId)

  useEffect(() => {
    accountsApi.list()
      .then((res) => setAccounts(res.data))
      .catch(() => {})
  }, [])

  const handleResolveSource = async () => {
    if (!sourceIdentifier || !accountId) return
    setResolvingSource(true)
    setSourceError('')
    setResolvedSource(null)
    try {
      const res = await entitiesApi.resolve({
        identifier: sourceIdentifier,
        account_id: Number(accountId),
      })
      setResolvedSource(res.data)
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

  const handleCreate = async () => {
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
        notes: notes || undefined,
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
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleCreate}
              disabled={loading || !name || !sourceIdentifier || !destIdentifier || !accountId}
            >
              {loading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Criar Job
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
