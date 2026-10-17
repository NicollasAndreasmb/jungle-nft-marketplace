/**
 * Idempotency and ordering gate for realtime events.
 *
 * Accepts an event only once (by eventId) and only when its version is newer than the last
 * version applied for the same resource, so duplicates and stale/out-of-order events never
 * regress state or re-run side effects.
 */
export interface VersionedEvent {
  eventId: string
  resource: { type: string; id: string }
  version: number
}

export interface EventGate {
  accept: (event: VersionedEvent) => boolean
  observeVersion: (resourceType: string, resourceId: string, version: number) => void
  lastVersion: (resourceType: string, resourceId: string) => number | undefined
  reset: () => void
}

const MAX_REMEMBERED_EVENTS = 500

export function createEventGate(): EventGate {
  const seenEventIds = new Set<string>()
  const versions = new Map<string, number>()
  const key = (type: string, id: string) => `${type}:${id}`

  return {
    accept(event) {
      if (seenEventIds.has(event.eventId)) return false
      seenEventIds.add(event.eventId)
      if (seenEventIds.size > MAX_REMEMBERED_EVENTS) {
        const oldest = seenEventIds.values().next().value
        if (oldest !== undefined) seenEventIds.delete(oldest)
      }
      const resourceKey = key(event.resource.type, event.resource.id)
      const current = versions.get(resourceKey)
      if (current !== undefined && event.version <= current) return false
      versions.set(resourceKey, event.version)
      return true
    },
    observeVersion(resourceType, resourceId, version) {
      const resourceKey = key(resourceType, resourceId)
      const current = versions.get(resourceKey)
      if (current === undefined || version > current) versions.set(resourceKey, version)
    },
    lastVersion: (resourceType, resourceId) => versions.get(key(resourceType, resourceId)),
    reset() {
      seenEventIds.clear()
      versions.clear()
    },
  }
}
