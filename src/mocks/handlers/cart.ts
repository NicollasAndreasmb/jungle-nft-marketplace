/**
 * Mock handlers for the cart (guest via HttpOnly cart cookie, or the authenticated user's cart):
 * read, add, update and remove items honoring per-edition availability and per-order limits,
 * and apply/remove coupons with invalid/expired handling. Totals are always computed here.
 */
import { HttpResponse } from 'msw'
import { addCartItemRequestSchema, applyCouponRequestSchema, updateCartItemRequestSchema } from '@/api/contracts'
import { randomId } from '../crypto'
import { type CartRecord } from '../db'
import { findEdition, findNft, lookupCoupon, resolveCart, toCart, touchCart } from '../domain'
import { HttpProblem, jsonWithCookies, parseBody, route } from '../http'

function respond(cart: CartRecord, cookie: string | null): Response {
  return cookie ? jsonWithCookies(toCart(cart), [cookie]) : HttpResponse.json(toCart(cart))
}

function assertQuantity(quantity: number, available: number, maxPerOrder: number): void {
  if (available === 0) {
    throw new HttpProblem(409, 'SOLD_OUT', 'Esta edição está esgotada.')
  }
  if (quantity > maxPerOrder) {
    throw new HttpProblem(409, 'QUANTITY_LIMIT', `O limite é de ${maxPerOrder} unidade(s) por pedido para esta edição.`, {
      details: { maxPerOrder, available },
    })
  }
  if (quantity > available) {
    throw new HttpProblem(409, 'AVAILABILITY_CONFLICT', `Apenas ${available} unidade(s) disponível(is) desta edição.`, {
      details: { maxPerOrder, available },
    })
  }
}

export const cartHandlers = [
  route('get', '/cart', async ({ cookies }) => {
    const { cart, cookie } = await resolveCart(cookies)
    return respond(cart, cookie)
  }),

  route('post', '/cart/items', async ({ request, cookies }) => {
    const body = await parseBody(request, addCartItemRequestSchema)
    const { cart, cookie } = await resolveCart(cookies)
    const nft = findNft(body.nftId)
    const edition = findEdition(nft, body.editionId)
    const existing = cart.lines.find((line) => line.editionId === edition.id)
    const nextQuantity = (existing?.quantity ?? 0) + body.quantity
    assertQuantity(nextQuantity, edition.available, edition.maxPerOrder)
    if (existing) {
      existing.quantity = nextQuantity
      existing.acknowledgedPriceEth = edition.priceEth
    } else {
      cart.lines.push({
        id: randomId('line'),
        nftId: nft.id,
        editionId: edition.id,
        quantity: body.quantity,
        acknowledgedPriceEth: edition.priceEth,
      })
    }
    touchCart(cart)
    return respond(cart, cookie)
  }),

  route('patch', '/cart/items/:itemId', async ({ request, cookies, params }) => {
    const body = await parseBody(request, updateCartItemRequestSchema)
    const { cart, cookie } = await resolveCart(cookies)
    const line = cart.lines.find((candidate) => candidate.id === params.itemId)
    if (!line) throw new HttpProblem(404, 'CART_ITEM_NOT_FOUND', 'Item não encontrado no carrinho.')
    const edition = findEdition(findNft(line.nftId), line.editionId)
    assertQuantity(body.quantity, edition.available, edition.maxPerOrder)
    line.quantity = body.quantity
    touchCart(cart)
    return respond(cart, cookie)
  }),

  route('delete', '/cart/items/:itemId', async ({ cookies, params }) => {
    const { cart, cookie } = await resolveCart(cookies)
    const before = cart.lines.length
    cart.lines = cart.lines.filter((line) => line.id !== params.itemId)
    if (cart.lines.length === before) throw new HttpProblem(404, 'CART_ITEM_NOT_FOUND', 'Item não encontrado no carrinho.')
    touchCart(cart)
    return respond(cart, cookie)
  }),

  route('put', '/cart/coupon', async ({ request, cookies }) => {
    const body = await parseBody(request, applyCouponRequestSchema)
    const { cart, cookie } = await resolveCart(cookies)
    const lookup = lookupCoupon(body.code)
    if (lookup.status !== 'valid') {
      throw lookup.status === 'expired'
        ? new HttpProblem(422, 'COUPON_EXPIRED', 'Cupom expirado.', { fieldErrors: { code: 'Este cupom expirou.' } })
        : new HttpProblem(422, 'COUPON_INVALID', 'Cupom inválido.', { fieldErrors: { code: 'Cupom inválido. Confira o código.' } })
    }
    cart.couponCode = lookup.coupon.code
    touchCart(cart)
    return respond(cart, cookie)
  }),

  route('delete', '/cart/coupon', async ({ cookies }) => {
    const { cart, cookie } = await resolveCart(cookies)
    cart.couponCode = null
    touchCart(cart)
    return respond(cart, cookie)
  }),
]
