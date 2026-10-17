/**
 * Order queries. Pending orders poll as a fallback to realtime and stop once terminal
 * (confirmed or rejected), which is also what the recovery banner relies on after refreshes.
 */
import { queryOptions, useQuery } from '@tanstack/react-query'
import { checkoutApi } from '@/api/checkout'
import { queryKeys } from '@/api/query-keys'
import { useSession } from '@/features/session/session-queries'

export const PENDING_POLL_INTERVAL_MS = 5_000

export const orderQueryOptions = (userId: string, orderId: string) =>
  queryOptions({
    queryKey: queryKeys.order(userId, orderId),
    queryFn: ({ signal }) => checkoutApi.getOrder(orderId, signal),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? PENDING_POLL_INTERVAL_MS : false),
  })

export function usePendingOrders() {
  const { user } = useSession()
  return useQuery({
    queryKey: queryKeys.pendingOrders(user?.id ?? 'anonymous'),
    queryFn: ({ signal }) => checkoutApi.listPendingOrders(signal),
    enabled: Boolean(user),
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? PENDING_POLL_INTERVAL_MS : false),
  })
}
