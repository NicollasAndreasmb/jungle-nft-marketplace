/**
 * Control surface of the mock backend, used by the scenario panel and by Playwright through
 * `window.__jungleMock`. Every action mutates the mock server state, so REST responses and
 * Socket.IO events stay consistent (nothing here touches the app's cache or components).
 */
import { db, resetDatabase } from './db'
import { expireSessionsOf, findEdition, findNft, updateEdition } from './domain'
import { cancelScheduledResolutions, resolvePendingOrdersNow } from './handlers/checkout'
import { realtimeStatus, replayLastEvent, replayStaleNftEvent, setRealtimeOffline } from './realtime'
import {
  type FaultRule,
  SCENARIOS,
  addFault,
  getScenario,
  setLatencyOverride,
  setPaymentDelay,
  setScenario,
} from './scenarios'

export const mockControl = {
  scenarios: SCENARIOS,
  getScenario: () => getScenario(),
  setScenario: (id: string) => setScenario(id),
  setLatency: (ms: number | null) => setLatencyOverride(ms),
  setPaymentDelay: (ms: number) => setPaymentDelay(ms),
  addFault: (rule: FaultRule) => addFault(rule),

  async reset(options: { reload?: boolean } = {}) {
    cancelScheduledResolutions()
    await resetDatabase()
    setScenario('default')
    try {
      localStorage.removeItem('__msw-cookie-store__')
      sessionStorage.clear()
    } catch {
      /* storage unavailable */
    }
    if (options.reload !== false) window.location.reload()
  },

  updateEdition(nftId: string, editionId: string, changes: { priceEth?: string; available?: number }) {
    const nft = updateEdition(nftId, editionId, changes)
    return { nftId: nft.id, version: nft.version, edition: findEdition(nft, editionId) }
  },

  bumpPrice(nftId: string, editionId: string, priceEth: string) {
    return mockControl.updateEdition(nftId, editionId, { priceEth })
  },

  getEdition(nftId: string, editionId: string) {
    return { ...findEdition(findNft(nftId), editionId), version: findNft(nftId).version }
  },

  replayLastEvent: replayLastEvent,
  replayStaleNftEvent: replayStaleNftEvent,
  setRealtimeOffline: setRealtimeOffline,
  realtimeStatus: realtimeStatus,
  expireSession: (userId?: string) => expireSessionsOf(userId),
  resolvePendingOrders: () => resolvePendingOrdersNow(),
  orders: () => db().orders.map(({ id, status, userId, version }) => ({ id, status, userId, version })),
}

export type MockControl = typeof mockControl

declare global {
  interface Window {
    __jungleMock?: MockControl
  }
}
