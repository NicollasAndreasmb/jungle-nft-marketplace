/**
 * Tab-scoped persistence for checkout progress (collector draft, connected wallet session and the
 * in-flight purchase attempt: idempotency key + exact request body + quote), so a refresh, timeout
 * or session renewal resumes the same attempt instead of creating another order.
 * Stored per user in sessionStorage and cleared on logout or user switch.
 */
import type { Collector, CreateOrderRequest, Network, Quote } from '@/api/contracts'

const PREFIX = 'jungle-checkout:'

export interface CheckoutAttempt {
  idempotencyKey: string
  body: CreateOrderRequest
  quote: Quote
}

export interface StoredWalletSession {
  sessionId: string
  walletId: string
  network: Network
}

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage unavailable: progress is kept in memory only */
  }
}

function remove(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key)
  } catch {
    /* storage unavailable */
  }
}

export const checkoutStorage = {
  readCollector: (userId: string) => read<Partial<Collector>>(`${userId}:collector`),
  writeCollector: (userId: string, collector: Partial<Collector>) => write(`${userId}:collector`, collector),
  readAttempt: (userId: string) => read<CheckoutAttempt>(`${userId}:attempt`),
  writeAttempt: (userId: string, attempt: CheckoutAttempt) => write(`${userId}:attempt`, attempt),
  clearAttempt: (userId: string) => remove(`${userId}:attempt`),
  readWalletSession: (userId: string) => read<StoredWalletSession>(`${userId}:wallet`),
  writeWalletSession: (userId: string, session: StoredWalletSession) => write(`${userId}:wallet`, session),
  clearWalletSession: (userId: string) => remove(`${userId}:wallet`),
}

export function clearCheckoutDrafts(options: { keepUserId?: string } = {}): void {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(PREFIX) && !(options.keepUserId && key.startsWith(`${PREFIX}${options.keepUserId}:`)))
      .forEach((key) => sessionStorage.removeItem(key))
  } catch {
    /* storage unavailable */
  }
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID().replaceAll('-', '') + Date.now().toString(36)
}
