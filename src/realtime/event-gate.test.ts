import { describe, expect, it } from 'vitest'
import { createEventGate } from './event-gate'

const event = (eventId: string, version: number, id = 'nft-001') => ({ eventId, version, resource: { type: 'nft', id } })

describe('event gate', () => {
  it('accepts newer versions in order', () => {
    const gate = createEventGate()
    expect(gate.accept(event('a', 2))).toBe(true)
    expect(gate.accept(event('b', 3))).toBe(true)
    expect(gate.lastVersion('nft', 'nft-001')).toBe(3)
  })

  it('rejects duplicates by event id', () => {
    const gate = createEventGate()
    expect(gate.accept(event('a', 2))).toBe(true)
    expect(gate.accept(event('a', 2))).toBe(false)
  })

  it('rejects stale and equal versions even with new ids', () => {
    const gate = createEventGate()
    gate.accept(event('a', 5))
    expect(gate.accept(event('b', 4))).toBe(false)
    expect(gate.accept(event('c', 5))).toBe(false)
  })

  it('respects versions observed from REST', () => {
    const gate = createEventGate()
    gate.observeVersion('nft', 'nft-001', 7)
    expect(gate.accept(event('a', 6))).toBe(false)
    expect(gate.accept(event('b', 8))).toBe(true)
  })

  it('tracks resources independently and can be reset', () => {
    const gate = createEventGate()
    gate.accept(event('a', 3, 'nft-001'))
    expect(gate.accept(event('b', 1, 'nft-002'))).toBe(true)
    gate.reset()
    expect(gate.accept(event('a', 1, 'nft-001'))).toBe(true)
  })
})
