/**
 * TanStack Query client and cache policy.
 *
 * - Queries: 30 s stale time, 5 min garbage collection, refetch on focus/reconnect.
 * - Retries: up to 2 extra attempts only for transient failures (network, timeout, 5xx, 429),
 *   with exponential backoff capped at 4 s; client errors (4xx) are never retried.
 * - Mutations: never retried automatically; order creation handles its own idempotent retry.
 */
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/http'

export const MAX_QUERY_RETRIES = 2

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && error.isRetryable && failureCount < MAX_QUERY_RETRIES
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  })
}
