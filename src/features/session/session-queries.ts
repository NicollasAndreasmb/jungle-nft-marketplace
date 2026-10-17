/**
 * Session state on top of TanStack Query: current session query (401 means guest), and
 * login/register/logout mutations that swap identities and purge the previous user's cache
 * (queries, mutation inputs, checkout drafts), notifying other tabs of the same browser.
 */
import { queryOptions, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import type { LoginRequest, RegisterRequest, Session } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { queryKeys } from '@/api/query-keys'
import { clearCheckoutDrafts } from '@/features/checkout/checkout-storage'

export const sessionQueryOptions = queryOptions({
  queryKey: queryKeys.session,
  queryFn: async ({ signal }): Promise<Session | null> => {
    try {
      const lookup = await authApi.getSession(signal)
      return lookup.user ? { user: lookup.user, expiresAt: lookup.expiresAt } : null
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 60_000,
})

export function useSession() {
  const query = useQuery(sessionQueryOptions)
  return {
    session: query.data ?? null,
    user: query.data?.user ?? null,
    isLoading: query.isPending,
    isError: query.isError,
  }
}

export async function purgePrivateState(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryKeys.privateRoot })
  await queryClient.cancelQueries({ queryKey: queryKeys.cartRoot })
  queryClient.removeQueries({ queryKey: queryKeys.privateRoot })
  queryClient.removeQueries({ queryKey: queryKeys.cartRoot })
}

const SESSION_CHANNEL = 'jungle-session'

export function broadcastIdentityChange(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(SESSION_CHANNEL)
  channel.postMessage('identity-changed')
  channel.close()
}

export function onIdentityChangedElsewhere(listener: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined
  const channel = new BroadcastChannel(SESSION_CHANNEL)
  channel.onmessage = () => listener()
  return () => channel.close()
}

async function switchIdentity(queryClient: QueryClient, session: Session | null): Promise<void> {
  await purgePrivateState(queryClient)
  queryClient.getMutationCache().clear()
  queryClient.setQueryData(queryKeys.session, session)
}

async function signIn(queryClient: QueryClient, session: Session): Promise<void> {
  clearCheckoutDrafts({ keepUserId: session.user.id })
  await switchIdentity(queryClient, session)
  broadcastIdentityChange()
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: (session) => signIn(queryClient, session),
  })
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RegisterRequest) => authApi.register(body),
    onSuccess: (session) => signIn(queryClient, session),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearCheckoutDrafts()
      broadcastIdentityChange()
      return switchIdentity(queryClient, null)
    },
  })
}

export async function handleSessionLost(queryClient: QueryClient): Promise<boolean> {
  const hadSession = Boolean(queryClient.getQueryData<Session | null>(queryKeys.session))
  await switchIdentity(queryClient, null)
  return hadSession
}
