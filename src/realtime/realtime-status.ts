import { createContext, useContext } from 'react'

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting'

export const RealtimeStatusContext = createContext<RealtimeStatus>('connecting')

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeStatusContext)
}
