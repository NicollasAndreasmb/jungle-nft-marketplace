/**
 * Reacts to session loss reported by any API call (expired or invalidated cookie): purges private
 * cache, informs the user and, when on a private screen, redirects to login keeping the current
 * location so the flow (e.g. checkout) resumes after re-authentication. Also reloads the session
 * when another tab signs in or out, so no tab keeps showing the previous user's private data.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { onSessionError } from '@/api/http'
import { queryKeys } from '@/api/query-keys'
import { handleSessionLost, onIdentityChangedElsewhere, purgePrivateState } from './session-queries'

const PRIVATE_PREFIXES = ['/checkout', '/pedidos', '/perfil', '/carteiras']

export function SessionWatcher() {
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    let handling = false
    return onSessionError((error) => {
      if (error.code !== 'SESSION_EXPIRED' && error.code !== 'UNAUTHENTICATED') return
      if (handling || !queryClient.getQueryData(queryKeys.session)) return
      handling = true
      void handleSessionLost(queryClient).then((hadSession) => {
        handling = false
        if (!hadSession) return
        toast.warning('Sua sessão expirou. Entre novamente para continuar.')
        const location = router.state.location
        if (PRIVATE_PREFIXES.some((prefix) => location.pathname.startsWith(prefix))) {
          void router.navigate({ to: '/login', search: { redirect: location.href, reason: 'expired' } })
        }
      })
    })
  }, [queryClient, router])

  useEffect(
    () =>
      onIdentityChangedElsewhere(() => {
        void purgePrivateState(queryClient).then(() => queryClient.invalidateQueries({ queryKey: queryKeys.session }))
      }),
    [queryClient],
  )

  return null
}
