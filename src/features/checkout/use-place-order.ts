/**
 * Idempotent order submission.
 *
 * The attempt (idempotency key + exact body + quote) is persisted before the first request.
 * Transport failures (timeout, network, 5xx) are retried with the same key and body, so the
 * server returns the order it may already have created instead of creating another one.
 * A ref guard ignores repeated clicks while a submission is in flight. Definitive rejections
 * (stale quote, expired quote, validation) discard the attempt; transport failures keep it so
 * the user (or a later visit) can resume it.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { checkoutApi } from '@/api/checkout'
import type { Order } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { queryKeys } from '@/api/query-keys'
import { type CheckoutAttempt, checkoutStorage } from './checkout-storage'

export const MAX_ORDER_TRANSPORT_RETRIES = 2
const RETRY_BASE_DELAY_MS = 800

export function isTransportFailure(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'timeout' || error.kind === 'network' || (error.status ?? 0) >= 500)
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function usePlaceOrder(userId: string, onPlaced: (order: Order) => void) {
  const queryClient = useQueryClient()
  const inFlight = useRef(false)
  const [retryCount, setRetryCount] = useState(0)

  const mutation = useMutation({
    mutationFn: async (attempt: CheckoutAttempt) => {
      checkoutStorage.writeAttempt(userId, attempt)
      for (let tryIndex = 0; ; tryIndex += 1) {
        try {
          return await checkoutApi.createOrder(attempt.body, attempt.idempotencyKey)
        } catch (error) {
          if (!isTransportFailure(error) || tryIndex >= MAX_ORDER_TRANSPORT_RETRIES) throw error
          setRetryCount(tryIndex + 1)
          await wait(RETRY_BASE_DELAY_MS * (tryIndex + 1))
        }
      }
    },
    onSuccess: (order) => {
      checkoutStorage.clearAttempt(userId)
      queryClient.setQueryData(queryKeys.order(userId, order.id), order)
      void queryClient.invalidateQueries({ queryKey: queryKeys.pendingOrders(userId) })
      onPlaced(order)
    },
    onError: (error) => {
      if (!isTransportFailure(error) && !(error instanceof ApiError && error.status === 401)) {
        checkoutStorage.clearAttempt(userId)
      }
    },
    onSettled: () => {
      inFlight.current = false
      setRetryCount(0)
    },
  })

  const place = (attempt: CheckoutAttempt, callbacks: { onError?: (error: Error) => void } = {}) => {
    if (inFlight.current) return
    inFlight.current = true
    mutation.mutate(attempt, { onError: callbacks.onError })
  }

  return { place, retryCount, ...mutation }
}
