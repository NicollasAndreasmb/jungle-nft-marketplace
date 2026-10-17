/**
 * Owns the Socket.IO client for the current session.
 *
 * Opens one socket per identity (guest or user) with a fresh single-use ticket on every
 * (re)connection, validates incoming events, filters them through the event gate and the
 * session's user id, applies them to the cache, and reconciles with REST after reconnecting.
 * Changing user or unmounting removes every listener and closes the socket.
 */
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { authApi } from '@/api/auth'
import { REALTIME_EVENTS, nftUpdatedEventSchema, orderUpdatedEventSchema } from '@/api/contracts'
import { cartScope } from '@/api/query-keys'
import { toast } from 'sonner'
import { useSession } from '@/features/session/session-queries'
import { applyNftUpdated, applyOrderUpdated, reconcileAfterReconnect } from './apply-events'
import { createEventGate } from './event-gate'
import { realtimeBus } from './realtime-bus'
import { type RealtimeStatus, RealtimeStatusContext } from './realtime-status'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'wss://realtime.jungle.mock'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { user, isLoading } = useSession()
  const userId = user?.id ?? null
  const identity = isLoading ? 'loading' : (userId ?? 'guest')
  const [connection, setConnection] = useState<{ identity: string; status: RealtimeStatus }>({ identity, status: 'connecting' })
  const status: RealtimeStatus = connection.identity === identity ? connection.status : 'connecting'

  useEffect(() => {
    if (isLoading) return
    let active = true
    let connectedBefore = false
    const gate = createEventGate()
    const setStatus = (next: RealtimeStatus) => setConnection({ identity, status: next })

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      auth: (callback) => {
        if (!userId) {
          callback({})
          return
        }
        authApi
          .createRealtimeTicket()
          .then(({ ticket }) => callback({ ticket }))
          .catch(() => callback({}))
      },
    })

    socket.on('connect', () => {
      if (!active) return
      setStatus('connected')
      if (connectedBefore) reconcileAfterReconnect(queryClient, userId)
      connectedBefore = true
    })
    socket.on('disconnect', () => {
      if (active) setStatus('reconnecting')
    })
    socket.on('connect_error', () => {
      if (active) setStatus('reconnecting')
    })

    socket.on(REALTIME_EVENTS.nftUpdated, (payload: unknown) => {
      if (!active) return
      const parsed = nftUpdatedEventSchema.safeParse(payload)
      if (!parsed.success || !gate.accept(parsed.data)) return
      const notices = applyNftUpdated(queryClient, parsed.data, cartScope(userId))
      notices.forEach((notice) => toast.warning(notice, { id: `${parsed.data.resource.id}-${notice}` }))
      realtimeBus.nftUpdated.emit(parsed.data)
    })

    socket.on(REALTIME_EVENTS.orderUpdated, (payload: unknown) => {
      if (!active || !userId) return
      const parsed = orderUpdatedEventSchema.safeParse(payload)
      if (!parsed.success || parsed.data.data.userId !== userId || !gate.accept(parsed.data)) return
      applyOrderUpdated(queryClient, parsed.data, userId)
      realtimeBus.orderUpdated.emit(parsed.data)
    })

    socket.connect()

    return () => {
      active = false
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [identity, isLoading, queryClient, userId])

  return <RealtimeStatusContext.Provider value={status}>{children}</RealtimeStatusContext.Provider>
}
