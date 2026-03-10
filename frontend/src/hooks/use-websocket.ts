import { useEffect, useRef, useCallback, useState } from 'react'
import type { LogEntry } from '@/types'

export function useJobLogs(jobId: number | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!jobId) return

    const apiUrl = import.meta.env.VITE_API_URL || ''
    let wsUrl: string
    if (apiUrl) {
      // External backend: convert http(s) to ws(s)
      wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/jobs/${jobId}/logs`
    } else {
      // Same origin (dev proxy or same server)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = `${protocol}//${window.location.host}/ws/jobs/${jobId}/logs`
    }
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Auto-reconnect after 3 seconds
      reconnectRef.current = setTimeout(() => connect(), 3000)
    }
    ws.onerror = () => ws.close()
    ws.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as LogEntry
        setLogs((prev) => [...prev.slice(-499), entry])
      } catch {
        // ignore malformed messages
      }
    }
  }, [jobId])

  useEffect(() => {
    setLogs([])
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const clearLogs = useCallback(() => setLogs([]), [])

  return { logs, connected, clearLogs }
}
