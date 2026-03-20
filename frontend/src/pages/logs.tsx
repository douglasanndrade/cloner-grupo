import { useState, useEffect } from 'react'
import {
  ScrollText,
  Search,
  RefreshCw,
  Filter,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LogLevelBadge } from '@/components/ui/status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { logsApi } from '@/services/api'
import type { LogEntry, LogLevel } from '@/types'

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [jobFilter, setJobFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchLogs = () => {
    setLoading(true)
    logsApi.list({
      level: levelFilter === 'all' ? undefined : levelFilter,
      job_id: jobFilter ? Number(jobFilter) : undefined,
      per_page: 200,
    })
      .then((res) => setLogs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchLogs()
  }, [levelFilter])

  const filteredLogs = logs.filter((log) => {
    if (searchQuery) {
      return log.message.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Logs do Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Todos os eventos registrados pela aplicação
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              placeholder="Buscar nos logs..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Nível" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Sucesso</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Job ID"
              className="w-[100px]"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="font-mono text-xs">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 border-b border-border py-2.5 px-4 hover:bg-surface-hover transition-colors"
                >
                  <span className="text-muted shrink-0 w-[150px]">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </span>
                  <div className="shrink-0 w-[60px]">
                    <LogLevelBadge level={log.level} />
                  </div>
                  {log.job_id && (
                    <Badge variant="outline" className="shrink-0">
                      Job #{log.job_id}
                    </Badge>
                  )}
                  <span className="text-foreground flex-1 break-all">{log.message}</span>
                  {log.details && (
                    <span className="text-muted shrink-0 max-w-[200px] truncate" title={log.details}>
                      {log.details}
                    </span>
                  )}
                </div>
              ))}
              {filteredLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ScrollText className="h-10 w-10 mb-3" />
                  <p>Nenhum log encontrado</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
