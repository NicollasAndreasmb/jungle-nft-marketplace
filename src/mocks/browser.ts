/**
 * Boots the mock backend in the browser: loads the persisted database and scenario, resumes
 * pending order resolutions, starts the MSW service worker (REST) and the WebSocket interceptor
 * (Socket.IO), and exposes the control API on `window.__jungleMock`.
 */
import { setupWorker } from 'msw/browser'
import { mockControl } from './control'
import { loadDatabase } from './db'
import { accountHandlers } from './handlers/account'
import { authHandlers } from './handlers/auth'
import { cartHandlers } from './handlers/cart'
import { catalogHandlers } from './handlers/catalog'
import { checkoutHandlers, resumePendingOrders } from './handlers/checkout'
import { realtimeHandler } from './realtime'
import { loadScenario } from './scenarios'

export async function startMockBackend(): Promise<void> {
  await loadDatabase()
  loadScenario()
  const worker = setupWorker(
    ...authHandlers,
    ...catalogHandlers,
    ...cartHandlers,
    ...accountHandlers,
    ...checkoutHandlers,
    realtimeHandler,
  )
  await worker.start({
    onUnhandledRequest(request, print) {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) print.warning()
    },
    quiet: import.meta.env.PROD,
  })
  resumePendingOrders()
  window.__jungleMock = mockControl
}
