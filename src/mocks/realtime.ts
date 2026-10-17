/**
 * Socket.IO mock server built on MSW `ws` + `@mswjs/socket.io-binding`.
 *
 * - Intercepts the socket.io-client WebSocket transport and speaks the Socket.IO protocol.
 * - Authenticates a connection once, from the first CONNECT packet `auth.ticket` (single-use,
 *   short-lived ticket bound to the issuing session); unauthenticated sockets only get public events.
 *   Private deliveries re-check that session, and sockets of revoked sessions are closed.
 * - Sends engine.io heartbeats, which the binding does not emit, so the client keeps the link alive.
 * - Publishes `nft.updated` to everyone and `order.updated` only to the owner's connections.
 * - Supports simulated outages (drop + refuse connections) and replaying duplicate/stale events.
 */
import { toSocketIo } from '@mswjs/socket.io-binding'
import { ws } from 'msw'
import { type NftUpdatedEvent, type OrderUpdatedEvent, REALTIME_EVENTS } from '@/api/contracts'
import { randomId, randomToken } from './crypto'
import { db } from './db'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'wss://realtime.jungle.mock'
const HEARTBEAT_INTERVAL_MS = 20_000
const TICKET_TTL_MS = 60_000

type SocketIoServerConnection = ReturnType<typeof toSocketIo>

interface ConnectionEntry {
  id: string
  io: SocketIoServerConnection
  close: () => void
  userId: string | null
  sessionTokenHash: string | null
  authenticated: boolean
  heartbeat: ReturnType<typeof setInterval>
}

type RealtimeEvent = NftUpdatedEvent | OrderUpdatedEvent

const connections = new Map<string, ConnectionEntry>()
const tickets = new Map<string, { userId: string; sessionTokenHash: string; expiresAt: number }>()
const history: Array<{ event: RealtimeEvent; audienceUserId: string | null }> = []
let offline = false

function sessionIsActive(userId: string, sessionTokenHash: string): boolean {
  return db().sessions.some(
    (session) => session.tokenHash === sessionTokenHash && session.userId === userId && new Date(session.expiresAt).getTime() > Date.now(),
  )
}

export function issueRealtimeTicket(userId: string, sessionTokenHash: string): { ticket: string; expiresAt: string } {
  const ticket = randomToken(24)
  const expiresAt = Date.now() + TICKET_TTL_MS
  tickets.set(ticket, { userId, sessionTokenHash, expiresAt })
  return { ticket, expiresAt: new Date(expiresAt).toISOString() }
}

function redeemTicket(ticket: unknown): { userId: string; sessionTokenHash: string } | null {
  if (typeof ticket !== 'string') return null
  const entry = tickets.get(ticket)
  tickets.delete(ticket)
  if (!entry || entry.expiresAt < Date.now() || !sessionIsActive(entry.userId, entry.sessionTokenHash)) return null
  return { userId: entry.userId, sessionTokenHash: entry.sessionTokenHash }
}

function parseConnectAuth(raw: string): { ticket?: unknown } | null {
  if (!raw.startsWith('40')) return null
  const payload = raw.slice(2)
  if (!payload) return {}
  try {
    const parsed: unknown = JSON.parse(payload)
    return typeof parsed === 'object' && parsed !== null ? (parsed as { ticket?: unknown }) : {}
  } catch {
    return {}
  }
}

export const realtimeLink = ws.link(`${SOCKET_URL}/*`)

export const realtimeHandler = realtimeLink.addEventListener('connection', (connection) => {
  const { client } = connection
  if (offline) {
    client.close(1013, 'Realtime service unavailable')
    return
  }

  const io = toSocketIo(connection)
  const entry: ConnectionEntry = {
    id: client.id,
    io,
    close: () => client.close(1001, 'Server closed connection'),
    userId: null,
    sessionTokenHash: null,
    authenticated: false,
    heartbeat: setInterval(() => client.send('2'), HEARTBEAT_INTERVAL_MS),
  }
  connections.set(entry.id, entry)

  client.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    if (entry.authenticated) return
    const auth = parseConnectAuth(event.data)
    if (!auth) return
    entry.authenticated = true
    const identity = redeemTicket(auth.ticket)
    entry.userId = identity?.userId ?? null
    entry.sessionTokenHash = identity?.sessionTokenHash ?? null
  })

  client.addEventListener('close', () => {
    clearInterval(entry.heartbeat)
    connections.delete(entry.id)
  })
})

function deliver(event: RealtimeEvent, audienceUserId: string | null): void {
  connections.forEach((entry) => {
    if (audienceUserId === null) {
      entry.io.client.emit(event.type, event)
      return
    }
    if (entry.userId !== audienceUserId) return
    if (!entry.sessionTokenHash || !sessionIsActive(entry.userId, entry.sessionTokenHash)) {
      entry.close()
      return
    }
    entry.io.client.emit(event.type, event)
  })
}

export function publishNftUpdated(nft: {
  id: string
  version: number
  data: NftUpdatedEvent['data']
}): NftUpdatedEvent {
  const event: NftUpdatedEvent = {
    eventId: randomId('evt'),
    type: REALTIME_EVENTS.nftUpdated,
    resource: { type: 'nft', id: nft.id },
    version: nft.version,
    occurredAt: new Date().toISOString(),
    data: nft.data,
  }
  history.push({ event, audienceUserId: null })
  deliver(event, null)
  return event
}

export function publishOrderUpdated(order: {
  id: string
  version: number
  status: OrderUpdatedEvent['data']['status']
  userId: string
}): OrderUpdatedEvent {
  const event: OrderUpdatedEvent = {
    eventId: randomId('evt'),
    type: REALTIME_EVENTS.orderUpdated,
    resource: { type: 'order', id: order.id },
    version: order.version,
    occurredAt: new Date().toISOString(),
    data: { status: order.status, userId: order.userId },
  }
  history.push({ event, audienceUserId: order.userId })
  deliver(event, order.userId)
  return event
}

export function replayLastEvent(type?: RealtimeEvent['type']): RealtimeEvent | null {
  const entry = [...history].reverse().find((item) => !type || item.event.type === type)
  if (!entry) return null
  deliver(entry.event, entry.audienceUserId)
  return entry.event
}

export function replayStaleNftEvent(nftId: string): NftUpdatedEvent | null {
  const events = history
    .map((item) => item.event)
    .filter((event): event is NftUpdatedEvent => event.type === REALTIME_EVENTS.nftUpdated && event.resource.id === nftId)
  const stale = events.length >= 2 ? events[events.length - 2] : null
  if (!stale) return null
  const replay: NftUpdatedEvent = { ...stale, eventId: randomId('evt') }
  deliver(replay, null)
  return replay
}

export function setRealtimeOffline(value: boolean): void {
  offline = value
  if (value) {
    connections.forEach((entry) => entry.close())
  }
}

export function disconnectUserConnections(userId: string): void {
  connections.forEach((entry) => {
    if (entry.userId === userId) entry.close()
  })
}

export function disconnectRevokedConnections(): void {
  connections.forEach((entry) => {
    if (entry.userId && entry.sessionTokenHash && !sessionIsActive(entry.userId, entry.sessionTokenHash)) entry.close()
  })
}

export function realtimeStatus(): { offline: boolean; connections: number; authenticated: number } {
  const all = [...connections.values()]
  return { offline, connections: all.length, authenticated: all.filter((entry) => entry.userId).length }
}
