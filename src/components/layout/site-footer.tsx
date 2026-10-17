/**
 * Global footer with the realtime connection status (text + icon, not color-only).
 */
import { Radio, RadioTower } from 'lucide-react'
import { useRealtimeStatus } from '@/realtime/realtime-status'

const STATUS_LABEL = {
  connecting: 'Conectando ao tempo real…',
  connected: 'Tempo real conectado',
  reconnecting: 'Tempo real reconectando…',
} as const

export function SiteFooter() {
  const status = useRealtimeStatus()
  const Icon = status === 'connected' ? RadioTower : Radio
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>Jungle NFT Marketplace — ambiente de demonstração com dados simulados.</p>
        <p className="flex items-center gap-2" data-testid="realtime-status" data-status={status}>
          <Icon className={status === 'connected' ? 'size-4 text-success' : 'size-4 text-warning'} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </p>
      </div>
    </footer>
  )
}
