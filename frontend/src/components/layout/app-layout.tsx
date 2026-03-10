import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { accountsApi } from '@/services/api'
import { AlertTriangle, X } from 'lucide-react'

export function AppLayout() {
  const { sidebarCollapsed } = useAppStore()
  const navigate = useNavigate()
  const [disconnectedAccounts, setDisconnectedAccounts] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check session status on load
    accountsApi.list().then(async (res) => {
      const accounts = res.data
      const down: string[] = []
      for (const acc of accounts) {
        try {
          const status = await accountsApi.checkStatus(acc.id)
          if (!status.data.is_active) {
            down.push(acc.phone)
          }
        } catch {
          down.push(acc.phone)
        }
      }
      if (down.length > 0) {
        setDisconnectedAccounts(down)
        setShowModal(true)
      }
    }).catch(() => {})
  }, [])

  const handleDismiss = () => {
    setShowModal(false)
    setDismissed(true)
  }

  const handleGoToAccounts = () => {
    setShowModal(false)
    setDismissed(true)
    navigate('/accounts')
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        )}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      {/* Session down modal */}
      {showModal && !dismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl shadow-lg max-w-md w-full mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10">
                  <AlertTriangle className="h-5 w-5 text-error" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Sessao Desconectada</h3>
                  <p className="text-sm text-muted-foreground">Conta Telegram precisa reconectar</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="text-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-error/5 border border-error/20 rounded-lg p-3 space-y-1">
              {disconnectedAccounts.map((phone) => (
                <div key={phone} className="flex items-center gap-2 text-sm text-error">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{phone}</span>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              A sessao dessa conta expirou ou foi desconectada. Voce precisa fazer login novamente na aba Contas Telegram para continuar clonando.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleGoToAccounts}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Ir para Contas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
