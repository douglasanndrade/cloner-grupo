import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

export function AppLayout() {
  const { sidebarCollapsed } = useAppStore()

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
    </div>
  )
}
