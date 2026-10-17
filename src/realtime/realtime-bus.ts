/**
 * In-app fan-out of realtime events that already passed through the Socket.IO client and the
 * event gate, so screens (checkout, order status) can react without opening their own sockets.
 */
import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/api/contracts'

type Listener<T> = (event: T) => void

function createChannel<T>() {
  const listeners = new Set<Listener<T>>()
  return {
    emit: (event: T) => listeners.forEach((listener) => listener(event)),
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const realtimeBus = {
  nftUpdated: createChannel<NftUpdatedEvent>(),
  orderUpdated: createChannel<OrderUpdatedEvent>(),
}
