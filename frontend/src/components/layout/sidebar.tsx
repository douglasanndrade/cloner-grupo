import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Copy,
  Plus,
  Users,
  Settings,
  ScrollText,
  Coins,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
  User,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'

// Lead menu — what regular users see
const leadNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Novo Job', href: '/jobs/new', icon: Plus },
  { name: 'Jobs', href: '/jobs', icon: Copy },
  { name: 'Créditos', href: '/credits', icon: Coins },
]

// Admin-only extras
const adminExtras = [
  { name: 'Contas Telegram', href: '/accounts', icon: Users },
  { name: 'Logs', href: '/logs', icon: ScrollText },
  { name: 'Configurações', href: '/settings', icon: Settings },
  { name: 'Painel Admin', href: '/admin', icon: Shield },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const logout = useAuthStore((s) => s.logout)
  const username = useAuthStore((s) => s.username)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Truncate email for display
  const displayName = username
    ? username.length > 20
      ? username.slice(0, 18) + '...'
      : username
    : ''

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border-border bg-sidebar transition-all duration-300 flex flex-col',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-foreground">Cloner</h1>
                <p className="text-[10px] text-muted">Telegram Group Cloner</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary mx-auto">
              <Zap className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {leadNavigation.map((item) => {
            const link = (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
                    sidebarCollapsed && 'justify-center px-0'
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span>{item.name}</span>}
              </NavLink>
            )

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              )
            }

            return link
          })}
          {isAdmin && (
            <>
              <div className={cn('px-3 pt-4 pb-1', sidebarCollapsed && 'px-0')}>
                {!sidebarCollapsed && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Admin</p>
                )}
              </div>
              {adminExtras.map((item) => {
                const adminLink = (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground',
                        sidebarCollapsed && 'justify-center px-0'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!sidebarCollapsed && <span>{item.name}</span>}
                  </NavLink>
                )

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.name}>
                      <TooltipTrigger asChild>{adminLink}</TooltipTrigger>
                      <TooltipContent side="right">{item.name}</TooltipContent>
                    </Tooltip>
                  )
                }

                return adminLink
              })}
            </>
          )}
        </nav>

        <Separator />

        {/* User info + Logout */}
        <div className="border-t border-border p-2 space-y-1">
          {!sidebarCollapsed && username && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate" title={username}>
                  {displayName}
                </p>
                <p className="text-[10px] text-muted">{isAdmin ? 'Administrador' : 'Usuário'}</p>
              </div>
            </div>
          )}
          {sidebarCollapsed && username && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center py-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">{username}</TooltipContent>
            </Tooltip>
          )}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className={cn('text-muted hover:text-error', sidebarCollapsed ? 'w-full justify-center' : 'flex-1')}
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              {!sidebarCollapsed && <span className="ml-2">Sair</span>}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className="justify-center"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
