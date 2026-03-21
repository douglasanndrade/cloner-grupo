import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { accountsApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth-store'
import { AlertTriangle, X, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AppLayout() {
  const { sidebarCollapsed } = useAppStore()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const navigate = useNavigate()
  const location = useLocation()
  const [disconnectedAccounts, setDisconnectedAccounts] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isAdmin) return
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
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-background/95 backdrop-blur-sm flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="ml-3 font-bold text-foreground">Cloner Grupo</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main
        className={cn(
          'min-h-screen transition-all duration-300',
          'pt-14 lg:pt-0', // mobile top padding for header
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        )}
      >
        <div className="p-4 sm:p-6">
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
