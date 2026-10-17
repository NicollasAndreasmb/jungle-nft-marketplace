/**
 * In-browser persistent database for the mock server.
 *
 * Holds the whole simulated backend state (users, sessions, catalog, carts, favorites, wallets,
 * quotes, orders and idempotency records), persists it to localStorage so refreshes keep data,
 * and can be reset to the deterministic seed at any time. Writes from other tabs (storage events)
 * replace the in-memory copy, so sessions revoked in one tab are revoked in all of them.
 */
import type { Collector, Network, OrderStatus, QuoteLine, WalletProvider, WalletSlot } from '@/api/contracts'
import { hashPassword } from './crypto'
import { COUPON_SEEDS, type CouponSeed, NFT_SEEDS, type NftSeed, USER_SEEDS } from './fixtures'

const STORAGE_KEY = 'jungle-mock-db'
const SCHEMA_VERSION = 1

export interface UserRecord {
  id: string
  name: string
  email: string
  username: string
  bio: string
  avatarUrl: string | null
  passwordHash: string
  passwordSalt: string
  createdAt: string
}

export interface SessionRecord {
  tokenHash: string
  userId: string
  createdAt: string
  expiresAt: string
}

export interface NftRecord extends NftSeed {
  version: number
}

export interface CartLineRecord {
  id: string
  nftId: string
  editionId: string
  quantity: number
  acknowledgedPriceEth: string
}

export interface CartRecord {
  id: string
  userId: string | null
  lines: CartLineRecord[]
  couponCode: string | null
  version: number
  updatedAt: string
}

export interface WalletRecord {
  id: string
  userId: string
  slot: WalletSlot
  label: string
  address: string
  provider: WalletProvider
  networks: Network[]
  updatedAt: string
}

export interface WalletSessionRecord {
  id: string
  userId: string
  walletId: string
  network: Network
  connectedAt: string
}

export interface QuoteRecord {
  id: string
  userId: string
  cartId: string
  network: Network
  couponCode: string | null
  items: QuoteLine[]
  subtotalEth: string
  discountEth: string
  networkFeeEth: string
  totalEth: string
  createdAt: string
  expiresAt: string
  consumedByOrderId: string | null
}

export interface OrderRecord {
  id: string
  userId: string
  quoteId: string
  status: OrderStatus
  version: number
  network: Network
  couponCode: string | null
  wallet: { label: string; address: string; provider: WalletProvider }
  collector: Collector
  items: QuoteLine[]
  subtotalEth: string
  discountEth: string
  networkFeeEth: string
  totalEth: string
  transaction: { hash: string; explorerUrl: string; blockNumber: number } | null
  failureReason: string | null
  outcome: 'confirmed' | 'rejected'
  resolveAt: string
  createdAt: string
  updatedAt: string
}

export interface IdempotencyRecord {
  key: string
  userId: string
  fingerprint: string
  orderId: string
  createdAt: string
}

export interface MockDatabase {
  schemaVersion: number
  users: UserRecord[]
  sessions: SessionRecord[]
  nfts: NftRecord[]
  coupons: CouponSeed[]
  carts: CartRecord[]
  favorites: Record<string, string[]>
  wallets: WalletRecord[]
  walletSessions: WalletSessionRecord[]
  quotes: QuoteRecord[]
  orders: OrderRecord[]
  idempotency: IdempotencyRecord[]
}

let database: MockDatabase | null = null

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z'

async function createSeed(): Promise<MockDatabase> {
  const users = await Promise.all(
    USER_SEEDS.map(async (seed): Promise<UserRecord> => {
      const { hash, salt } = await hashPassword(seed.password)
      return {
        id: seed.id,
        name: seed.name,
        email: seed.email,
        username: seed.username,
        bio: seed.bio,
        avatarUrl: null,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: SEED_TIMESTAMP,
      }
    }),
  )

  return {
    schemaVersion: SCHEMA_VERSION,
    users,
    sessions: [],
    nfts: structuredClone(NFT_SEEDS).map((nft) => ({ ...nft, version: 1 })),
    coupons: structuredClone(COUPON_SEEDS),
    carts: [],
    favorites: Object.fromEntries(USER_SEEDS.map((seed) => [seed.id, [...seed.favorites]])),
    wallets: USER_SEEDS.flatMap((seed) =>
      seed.wallets.map((wallet) => ({
        ...wallet,
        id: `wallet-${seed.id}-${wallet.slot}`,
        userId: seed.id,
        networks: [...wallet.networks],
        updatedAt: SEED_TIMESTAMP,
      })),
    ),
    walletSessions: [],
    quotes: [],
    orders: [],
    idempotency: [],
  }
}

function readPersisted(): MockDatabase | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MockDatabase
    return parsed.schemaVersion === SCHEMA_VERSION ? parsed : null
  } catch {
    return null
  }
}

let listeningToOtherTabs = false

export async function loadDatabase(): Promise<MockDatabase> {
  database = readPersisted() ?? (await createSeed())
  persist()
  if (!listeningToOtherTabs) {
    listeningToOtherTabs = true
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return
      database = readPersisted() ?? database
    })
  }
  return database
}

export function db(): MockDatabase {
  if (!database) {
    throw new Error('Mock database accessed before initialization')
  }
  return database
}

export function persist(): void {
  if (!database) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
  } catch (error) {
    console.warn('[mocks] Failed to persist mock database', error)
  }
}

export async function resetDatabase(): Promise<MockDatabase> {
  database = await createSeed()
  persist()
  return database
}

export function nowIso(): string {
  return new Date().toISOString()
}
