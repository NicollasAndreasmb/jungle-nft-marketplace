/**
 * Business rules of the simulated backend.
 *
 * Projections from records to API contracts, server-side pricing (subtotal, coupon discount,
 * network fee, total), coupon validation, session resolution, cart ownership and merging,
 * and catalog mutations that also publish `nft.updated` realtime events.
 */
import type {
  Cart,
  CartItem,
  Network,
  NftDetail,
  NftSummary,
  Order,
  PriceSummary,
  User,
  Wallet,
} from '@/api/contracts'
import { addEth, compareEth, minEth, multiplyEth, percentOfEth, subtractEth } from '@/lib/eth'
import { randomId, randomToken, sha256 } from './crypto'
import { type CartRecord, type MockDatabase, type NftRecord, type OrderRecord, type UserRecord, db, nowIso, persist } from './db'
import { COLLECTIONS, type CouponSeed } from './fixtures'
import { HttpProblem, serializeCookie } from './http'
import { disconnectRevokedConnections, publishNftUpdated } from './realtime'

export const SESSION_COOKIE = 'jg_session'
export const CART_COOKIE = 'jg_cart'
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000
export const QUOTE_TTL_MS = 10 * 60 * 1000
export const DEFAULT_FEE_NETWORK: Network = 'ethereum'

const NETWORK_FEES: Record<Network, { base: string; perUnit: string }> = {
  ethereum: { base: '0.0021', perUnit: '0.0004' },
  polygon: { base: '0.00008', perUnit: '0.00001' },
  base: { base: '0.00015', perUnit: '0.00002' },
}

export function networkFee(network: Network, units: number): string {
  if (units === 0) return '0'
  const fee = NETWORK_FEES[network]
  return addEth(fee.base, multiplyEth(fee.perUnit, units))
}

export function collectionName(collectionId: string): string {
  return COLLECTIONS.find((collection) => collection.id === collectionId)?.name ?? collectionId
}

function imageFor(nft: NftRecord, variant: number) {
  const labels = ['Obra principal', 'Detalhe da composição', 'Variação de cor']
  return {
    src: `/nfts/${nft.id}-${variant}.svg`,
    alt: `${nft.name} — ${labels[variant - 1] ?? 'Imagem'}, arte generativa da coleção ${collectionName(nft.collectionId)}`,
  }
}

export function fromPrice(nft: NftRecord): string | null {
  return minEth(nft.editions.filter((edition) => edition.available > 0).map((edition) => edition.priceEth))
}

export function totalAvailable(nft: NftRecord): number {
  return nft.editions.reduce((sum, edition) => sum + edition.available, 0)
}

export function toNftSummary(nft: NftRecord): NftSummary {
  return {
    id: nft.id,
    name: nft.name,
    image: imageFor(nft, 1),
    category: nft.category,
    collection: { id: nft.collectionId, name: collectionName(nft.collectionId) },
    creator: nft.creator,
    fromPriceEth: fromPrice(nft),
    totalAvailable: totalAvailable(nft),
    createdAt: nft.createdAt,
    version: nft.version,
  }
}

export function toNftDetail(nft: NftRecord): NftDetail {
  return {
    ...toNftSummary(nft),
    description: nft.description,
    gallery: [1, 2, 3].map((variant) => imageFor(nft, variant)),
    editions: nft.editions.map((edition) => ({ ...edition })),
    network: nft.network,
    contractAddress: nft.contractAddress,
  }
}

export function findNft(nftId: string): NftRecord {
  const nft = db().nfts.find((candidate) => candidate.id === nftId)
  if (!nft) throw new HttpProblem(404, 'NFT_NOT_FOUND', 'NFT não encontrado.')
  return nft
}

export function findEdition(nft: NftRecord, editionId: string) {
  const edition = nft.editions.find((candidate) => candidate.id === editionId)
  if (!edition) throw new HttpProblem(404, 'EDITION_NOT_FOUND', 'Edição não encontrada.')
  return edition
}

export function updateEdition(
  nftId: string,
  editionId: string,
  changes: { priceEth?: string; available?: number },
): NftRecord {
  const nft = findNft(nftId)
  const edition = findEdition(nft, editionId)
  if (changes.priceEth !== undefined) edition.priceEth = changes.priceEth
  if (changes.available !== undefined) edition.available = Math.max(0, Math.min(edition.supply, changes.available))
  nft.version += 1
  persist()
  publishNftUpdated({
    id: nft.id,
    version: nft.version,
    data: {
      editions: nft.editions.map(({ id, priceEth, available }) => ({ id, priceEth, available })),
      fromPriceEth: fromPrice(nft),
      totalAvailable: totalAvailable(nft),
    },
  })
  return nft
}

export function toUser(record: UserRecord): User {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    username: record.username,
    bio: record.bio,
    avatarUrl: record.avatarUrl,
  }
}

export type CouponLookup = { status: 'valid'; coupon: CouponSeed } | { status: 'expired' | 'invalid' }

export function lookupCoupon(code: string): CouponLookup {
  const coupon = db().coupons.find((candidate) => candidate.code === code.toUpperCase())
  if (!coupon) return { status: 'invalid' }
  if (new Date(coupon.expiresAt).getTime() < Date.now()) return { status: 'expired' }
  return { status: 'valid', coupon }
}

export function priceSummary(subtotalEth: string, units: number, couponCode: string | null, network: Network): PriceSummary {
  const lookup = couponCode ? lookupCoupon(couponCode) : null
  const discountEth = lookup?.status === 'valid' ? percentOfEth(subtotalEth, lookup.coupon.percentOff) : '0'
  const networkFeeEth = networkFee(network, units)
  return {
    subtotalEth,
    discountEth,
    networkFeeEth,
    totalEth: addEth(subtractEth(subtotalEth, discountEth), networkFeeEth),
  }
}

export interface SessionContext {
  user: UserRecord
  tokenHash: string
}

export const clearSessionCookie = () => serializeCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0 })

function sessionExpired(): HttpProblem {
  return new HttpProblem(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.', {
    headers: { 'Set-Cookie': clearSessionCookie() },
  })
}

export async function resolveSession(cookies: Record<string, string>): Promise<SessionContext | null> {
  const token = cookies[SESSION_COOKIE]
  if (!token) return null
  const tokenHash = await sha256(token)
  const session = db().sessions.find((candidate) => candidate.tokenHash === tokenHash)
  if (!session) throw sessionExpired()
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    db().sessions = db().sessions.filter((candidate) => candidate.tokenHash !== tokenHash)
    persist()
    throw sessionExpired()
  }
  const user = db().users.find((candidate) => candidate.id === session.userId)
  if (!user) throw sessionExpired()
  return { user, tokenHash }
}

export async function requireSession(cookies: Record<string, string>): Promise<SessionContext> {
  const session = await resolveSession(cookies)
  if (!session) throw new HttpProblem(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.')
  return session
}

export async function createSession(userId: string): Promise<{ cookie: string; expiresAt: string }> {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db().sessions.push({ tokenHash: await sha256(token), userId, createdAt: nowIso(), expiresAt })
  persist()
  return { cookie: serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_MS / 1000 }), expiresAt }
}

export function expireSessionsOf(userId?: string): number {
  let count = 0
  db().sessions.forEach((session) => {
    if (!userId || session.userId === userId) {
      session.expiresAt = new Date(Date.now() - 1000).toISOString()
      count += 1
    }
  })
  persist()
  disconnectRevokedConnections()
  return count
}

function emptyCart(userId: string | null): CartRecord {
  return { id: userId ? randomId('cart') : `guest_${randomToken(16)}`, userId, lines: [], couponCode: null, version: 1, updatedAt: nowIso() }
}

export function cartOfUser(userId: string): CartRecord {
  let cart = db().carts.find((candidate) => candidate.userId === userId)
  if (!cart) {
    cart = emptyCart(userId)
    db().carts.push(cart)
    persist()
  }
  return cart
}

export function guestCart(cookies: Record<string, string>): { cart: CartRecord; cookie: string | null } {
  const cartId = cookies[CART_COOKIE]
  const existing = cartId ? db().carts.find((candidate) => candidate.id === cartId && candidate.userId === null) : undefined
  if (existing) return { cart: existing, cookie: null }
  const cart = emptyCart(null)
  db().carts.push(cart)
  persist()
  return { cart, cookie: serializeCookie(CART_COOKIE, cart.id, { maxAgeSeconds: 60 * 60 * 24 * 30 }) }
}

export async function resolveCart(cookies: Record<string, string>): Promise<{ cart: CartRecord; cookie: string | null }> {
  const session = await resolveSession(cookies)
  if (session) return { cart: cartOfUser(session.user.id), cookie: null }
  return guestCart(cookies)
}

export function touchCart(cart: CartRecord): void {
  cart.version += 1
  cart.updatedAt = nowIso()
  persist()
}

export function mergeGuestCart(cookies: Record<string, string>, userId: string): void {
  const cartId = cookies[CART_COOKIE]
  const guest = cartId ? db().carts.find((candidate) => candidate.id === cartId && candidate.userId === null) : undefined
  if (!guest || guest.lines.length === 0) return
  const target = cartOfUser(userId)
  for (const line of guest.lines) {
    const nft = db().nfts.find((candidate) => candidate.id === line.nftId)
    const edition = nft?.editions.find((candidate) => candidate.id === line.editionId)
    if (!nft || !edition) continue
    const existing = target.lines.find((candidate) => candidate.editionId === line.editionId)
    const limit = Math.min(edition.maxPerOrder, Math.max(edition.available, 1))
    if (existing) {
      existing.quantity = Math.min(limit, existing.quantity + line.quantity)
    } else {
      target.lines.push({ ...line, id: randomId('line'), quantity: Math.min(limit, line.quantity) })
    }
  }
  if (!target.couponCode && guest.couponCode) target.couponCode = guest.couponCode
  guest.lines = []
  guest.couponCode = null
  touchCart(guest)
  touchCart(target)
}

export function toCartItem(line: CartRecord['lines'][number]): CartItem | null {
  const nft = db().nfts.find((candidate) => candidate.id === line.nftId)
  const edition = nft?.editions.find((candidate) => candidate.id === line.editionId)
  if (!nft || !edition) return null
  const priceChanged = compareEth(edition.priceEth, line.acknowledgedPriceEth) !== 0
  const status: CartItem['status'] =
    edition.available === 0
      ? 'sold-out'
      : line.quantity > edition.available
        ? 'insufficient'
        : priceChanged
          ? 'price-changed'
          : 'ok'
  return {
    id: line.id,
    nftId: nft.id,
    editionId: edition.id,
    nftName: nft.name,
    editionName: edition.name,
    image: imageFor(nft, 1),
    unitPriceEth: edition.priceEth,
    previousUnitPriceEth: priceChanged ? line.acknowledgedPriceEth : null,
    quantity: line.quantity,
    available: edition.available,
    maxPerOrder: edition.maxPerOrder,
    lineTotalEth: multiplyEth(edition.priceEth, line.quantity),
    status,
  }
}

export function toCart(cart: CartRecord): Cart {
  const items = cart.lines.map(toCartItem).filter((item): item is CartItem => item !== null)
  const purchasable = items.filter((item) => item.status !== 'sold-out')
  const subtotalEth = addEth('0', ...purchasable.map((item) => item.lineTotalEth))
  const units = purchasable.reduce((sum, item) => sum + item.quantity, 0)
  const couponLookup = cart.couponCode ? lookupCoupon(cart.couponCode) : null
  const coupon =
    couponLookup?.status === 'valid'
      ? { code: couponLookup.coupon.code, description: couponLookup.coupon.description, percentOff: couponLookup.coupon.percentOff }
      : null
  return {
    id: cart.id,
    items,
    coupon,
    summary: priceSummary(subtotalEth, units, coupon?.code ?? null, DEFAULT_FEE_NETWORK),
    feeNetwork: DEFAULT_FEE_NETWORK,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    version: cart.version,
    updatedAt: cart.updatedAt,
  }
}

export function toWallet(record: MockDatabase['wallets'][number]): Wallet {
  return {
    id: record.id,
    slot: record.slot,
    label: record.label,
    address: record.address,
    provider: record.provider,
    networks: [...record.networks],
    updatedAt: record.updatedAt,
  }
}

export function toOrder(record: OrderRecord): Order {
  return {
    id: record.id,
    status: record.status,
    version: record.version,
    network: record.network,
    couponCode: record.couponCode,
    wallet: { ...record.wallet },
    collector: { ...record.collector },
    items: record.items.map((item) => ({ ...item, image: { ...item.image } })),
    subtotalEth: record.subtotalEth,
    discountEth: record.discountEth,
    networkFeeEth: record.networkFeeEth,
    totalEth: record.totalEth,
    transaction: record.transaction ? { ...record.transaction } : null,
    failureReason: record.failureReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
