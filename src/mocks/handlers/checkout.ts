/**
 * Mock handlers for checkout: binding quotes, idempotent order creation and order lookup.
 *
 * Order creation revalidates price, availability, coupon and fees against the quote, reserves
 * inventory, and resolves payment asynchronously (confirmed/rejected), publishing `order.updated`
 * to the owner. Pending orders are rescheduled on boot so a refresh never loses or duplicates them.
 */
import { delay, HttpResponse } from 'msw'
import {
  type QuoteChange,
  type QuoteLine,
  createOrderRequestSchema,
  createQuoteRequestSchema,
} from '@/api/contracts'
import { addEth, compareEth, multiplyEth, percentOfEth } from '@/lib/eth'
import { randomId, randomToken, sha256 } from '../crypto'
import { type OrderRecord, type QuoteRecord, db, nowIso, persist } from '../db'
import {
  QUOTE_TTL_MS,
  cartOfUser,
  findEdition,
  findNft,
  lookupCoupon,
  priceSummary,
  requireSession,
  toCart,
  toOrder,
  touchCart,
  updateEdition,
} from '../domain'
import { HttpProblem, parseBody, route } from '../http'
import { publishOrderUpdated } from '../realtime'
import { consumeFlag, getScenario } from '../scenarios'

const ORDER_TIMEOUT_DELAY_MS = 12_000
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const scheduled = new Map<string, ReturnType<typeof setTimeout>>()

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function removePurchasedFromCart(order: OrderRecord): void {
  const cart = cartOfUser(order.userId)
  for (const item of order.items) {
    const line = cart.lines.find((candidate) => candidate.editionId === item.editionId)
    if (line) line.quantity -= item.quantity
  }
  cart.lines = cart.lines.filter((line) => line.quantity > 0)
  if (cart.lines.length === 0) cart.couponCode = null
  touchCart(cart)
}

function resolveOrder(orderId: string): void {
  scheduled.delete(orderId)
  const order = db().orders.find((candidate) => candidate.id === orderId)
  if (!order || order.status !== 'pending') return
  order.status = order.outcome
  order.version += 1
  order.updatedAt = nowIso()
  if (order.outcome === 'confirmed') {
    const hash = `0x${randomToken(32)}`
    order.transaction = {
      hash,
      explorerUrl: `https://explorer.jungle.mock/${order.network}/tx/${hash}`,
      blockNumber: 19_000_000 + Math.floor(Date.now() / 1000) % 1_000_000,
    }
    removePurchasedFromCart(order)
  } else {
    order.failureReason = 'O pagamento foi recusado pela carteira. Nenhum valor foi cobrado.'
    for (const item of order.items) {
      const edition = findEdition(findNft(item.nftId), item.editionId)
      updateEdition(item.nftId, item.editionId, { available: edition.available + item.quantity })
    }
  }
  persist()
  publishOrderUpdated({ id: order.id, version: order.version, status: order.status, userId: order.userId })
}

function scheduleResolution(order: OrderRecord): void {
  if (order.status !== 'pending' || scheduled.has(order.id)) return
  const wait = Math.max(0, new Date(order.resolveAt).getTime() - Date.now())
  scheduled.set(order.id, setTimeout(() => resolveOrder(order.id), wait))
}

export function resumePendingOrders(): void {
  db().orders.filter((order) => order.status === 'pending').forEach(scheduleResolution)
}

export function resolvePendingOrdersNow(): number {
  const pending = db().orders.filter((order) => order.status === 'pending')
  pending.forEach((order) => {
    clearTimeout(scheduled.get(order.id))
    resolveOrder(order.id)
  })
  return pending.length
}

export function cancelScheduledResolutions(): void {
  scheduled.forEach((timer) => clearTimeout(timer))
  scheduled.clear()
}

function detectChanges(quote: QuoteRecord): QuoteChange[] {
  const changes: QuoteChange[] = []
  for (const line of quote.items) {
    const nft = db().nfts.find((candidate) => candidate.id === line.nftId)
    const edition = nft?.editions.find((candidate) => candidate.id === line.editionId)
    const base = { nftId: line.nftId, editionId: line.editionId, nftName: line.nftName, editionName: line.editionName }
    if (!edition || edition.available === 0) {
      changes.push({ ...base, kind: 'sold-out', previousUnitPriceEth: line.unitPriceEth, currentUnitPriceEth: edition?.priceEth ?? null, available: 0 })
    } else if (edition.available < line.quantity) {
      changes.push({ ...base, kind: 'insufficient', previousUnitPriceEth: line.unitPriceEth, currentUnitPriceEth: edition.priceEth, available: edition.available })
    } else if (compareEth(edition.priceEth, line.unitPriceEth) !== 0) {
      changes.push({ ...base, kind: 'price-changed', previousUnitPriceEth: line.unitPriceEth, currentUnitPriceEth: edition.priceEth, available: edition.available })
    }
  }
  if (quote.couponCode && lookupCoupon(quote.couponCode).status !== 'valid') {
    changes.push({
      nftId: '',
      editionId: '',
      nftName: quote.couponCode,
      editionName: '',
      kind: 'coupon-invalid',
      previousUnitPriceEth: null,
      currentUnitPriceEth: null,
      available: null,
    })
  }
  return changes
}

function applyCheckoutScenario(quote: QuoteRecord): void {
  const first = quote.items[0]
  if (!first) return
  if (consumeFlag('priceChangeOnCheckout')) {
    const edition = findEdition(findNft(first.nftId), first.editionId)
    updateEdition(first.nftId, first.editionId, { priceEth: addEth(edition.priceEth, percentOfEth(edition.priceEth, 10)) })
  }
  if (consumeFlag('soldOutOnCheckout')) {
    updateEdition(first.nftId, first.editionId, { available: 0 })
  }
}

export const checkoutHandlers = [
  route('post', '/checkout/quote', async ({ request, cookies }) => {
    const { user } = await requireSession(cookies)
    const body = await parseBody(request, createQuoteRequestSchema)
    const cartRecord = cartOfUser(user.id)
    const cart = toCart(cartRecord)
    if (cart.items.length === 0) {
      throw new HttpProblem(409, 'CART_EMPTY', 'Seu carrinho está vazio.')
    }
    const blocked: QuoteChange[] = cart.items
      .filter((item) => item.status === 'sold-out' || item.status === 'insufficient')
      .map((item) => ({
        nftId: item.nftId,
        editionId: item.editionId,
        nftName: item.nftName,
        editionName: item.editionName,
        kind: item.status === 'sold-out' ? 'sold-out' : 'insufficient',
        previousUnitPriceEth: item.unitPriceEth,
        currentUnitPriceEth: item.unitPriceEth,
        available: item.available,
      }))
    if (blocked.length > 0) {
      throw new HttpProblem(409, 'AVAILABILITY_CONFLICT', 'Ajuste os itens indisponíveis antes de continuar.', { details: blocked })
    }

    const items: QuoteLine[] = cart.items.map((item) => ({
      nftId: item.nftId,
      editionId: item.editionId,
      nftName: item.nftName,
      editionName: item.editionName,
      image: item.image,
      unitPriceEth: item.unitPriceEth,
      quantity: item.quantity,
      lineTotalEth: multiplyEth(item.unitPriceEth, item.quantity),
    }))
    const units = items.reduce((sum, item) => sum + item.quantity, 0)
    const summary = priceSummary(addEth('0', ...items.map((item) => item.lineTotalEth)), units, cart.coupon?.code ?? null, body.network)
    const createdAt = nowIso()
    const quote: QuoteRecord = {
      id: randomId('quote'),
      userId: user.id,
      cartId: cartRecord.id,
      network: body.network,
      couponCode: cart.coupon?.code ?? null,
      items,
      ...summary,
      createdAt,
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
      consumedByOrderId: null,
    }
    db().quotes = [...db().quotes.filter((candidate) => candidate.userId !== user.id || candidate.consumedByOrderId), quote]
    cartRecord.lines.forEach((line) => {
      const current = items.find((item) => item.editionId === line.editionId)
      if (current) line.acknowledgedPriceEth = current.unitPriceEth
    })
    touchCart(cartRecord)
    const { userId: _userId, cartId: _cartId, consumedByOrderId: _consumed, ...response } = quote
    return HttpResponse.json(response)
  }),

  route('post', '/orders', async ({ request, cookies }) => {
    const { user } = await requireSession(cookies)
    const idempotencyKey = request.headers.get('Idempotency-Key') ?? ''
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new HttpProblem(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Cabeçalho Idempotency-Key ausente ou inválido.')
    }
    const body = await parseBody(request, createOrderRequestSchema)
    const fingerprint = await sha256(stableStringify(body))

    const previous = db().idempotency.find((record) => record.key === idempotencyKey && record.userId === user.id)
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Esta tentativa de pedido já foi usada com dados diferentes.')
      }
      const existing = db().orders.find((order) => order.id === previous.orderId && order.userId === user.id)
      if (existing) {
        return HttpResponse.json(toOrder(existing), { status: 200, headers: { 'Idempotent-Replayed': 'true' } })
      }
    }

    const quote = db().quotes.find((candidate) => candidate.id === body.quoteId && candidate.userId === user.id)
    if (!quote) throw new HttpProblem(404, 'QUOTE_NOT_FOUND', 'Cotação não encontrada. Revise o pedido novamente.')
    if (quote.consumedByOrderId) throw new HttpProblem(409, 'QUOTE_ALREADY_USED', 'Esta cotação já foi utilizada em outro pedido.')
    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      throw new HttpProblem(409, 'QUOTE_EXPIRED', 'A cotação expirou. Gere uma nova revisão do pedido.')
    }

    const walletSession = db().walletSessions.find((session) => session.id === body.walletSessionId && session.userId === user.id)
    if (!walletSession) throw new HttpProblem(409, 'WALLET_NOT_CONNECTED', 'Conecte a carteira novamente para continuar.')
    if (walletSession.network !== quote.network) {
      throw new HttpProblem(409, 'NETWORK_MISMATCH', 'A rede da carteira conectada não corresponde à cotação.')
    }
    const wallet = db().wallets.find((candidate) => candidate.id === walletSession.walletId && candidate.userId === user.id)
    if (!wallet) throw new HttpProblem(409, 'WALLET_NOT_CONNECTED', 'Conecte a carteira novamente para continuar.')

    applyCheckoutScenario(quote)
    const changes = detectChanges(quote)
    if (changes.length > 0) {
      throw new HttpProblem(409, 'QUOTE_STALE', 'Preço, disponibilidade ou cupom mudaram. Revise o pedido.', { details: changes })
    }

    for (const item of quote.items) {
      const edition = findEdition(findNft(item.nftId), item.editionId)
      updateEdition(item.nftId, item.editionId, { available: edition.available - item.quantity })
    }

    const createdAt = nowIso()
    const order: OrderRecord = {
      id: randomId('order'),
      userId: user.id,
      quoteId: quote.id,
      status: 'pending',
      version: 1,
      network: quote.network,
      couponCode: quote.couponCode,
      wallet: { label: wallet.label, address: wallet.address, provider: wallet.provider },
      collector: body.collector,
      items: quote.items.map((item) => ({ ...item, image: { ...item.image } })),
      subtotalEth: quote.subtotalEth,
      discountEth: quote.discountEth,
      networkFeeEth: quote.networkFeeEth,
      totalEth: quote.totalEth,
      transaction: null,
      failureReason: null,
      outcome: getScenario().flags.paymentDeclined ? 'rejected' : 'confirmed',
      resolveAt: new Date(Date.now() + getScenario().paymentDelayMs).toISOString(),
      createdAt,
      updatedAt: createdAt,
    }
    db().orders.push(order)
    db().idempotency.push({ key: idempotencyKey, userId: user.id, fingerprint, orderId: order.id, createdAt })
    quote.consumedByOrderId = order.id
    persist()
    scheduleResolution(order)

    if (consumeFlag('orderTimeout')) {
      await delay(ORDER_TIMEOUT_DELAY_MS)
    }
    return HttpResponse.json(toOrder(order), { status: 201 })
  }),

  route('get', '/orders', async ({ cookies, url }) => {
    const { user } = await requireSession(cookies)
    const status = url.searchParams.get('status')
    const orders = db()
      .orders.filter((order) => order.userId === user.id && (!status || order.status === status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toOrder)
    return HttpResponse.json(orders)
  }),

  route('get', '/orders/:orderId', async ({ cookies, params }) => {
    const { user } = await requireSession(cookies)
    const order = db().orders.find((candidate) => candidate.id === params.orderId && candidate.userId === user.id)
    if (!order) throw new HttpProblem(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.')
    return HttpResponse.json(toOrder(order))
  }),
]
