/**
 * Recovery banner for orders still awaiting payment confirmation (e.g. after a refresh or a
 * dropped connection), linking back to the order status instead of starting a new purchase.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { usePendingOrders } from './order-queries'

export function PendingOrderBanner() {
  const { data } = usePendingOrders()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const order = data?.[0]
  if (!order || pathname === `/pedidos/${order.id}`) return null
  return (
    <div role="status" className="border-b bg-warning/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <Loader2 className="size-4 animate-spin text-warning" aria-hidden="true" />
        <span>Você tem um pedido aguardando confirmação do pagamento.</span>
        <Link to="/pedidos/$orderId" params={{ orderId: order.id }} className="font-medium underline underline-offset-4">
          Acompanhar pedido
        </Link>
      </div>
    </div>
  )
}
