/**
 * Cart endpoints: read, add/update/remove items and apply/remove coupon. The server owns totals.
 */
import { type AddCartItemRequest, cartSchema } from './contracts'
import { request } from './http'

export const cartApi = {
  get: (signal?: AbortSignal) => request(cartSchema, { url: '/cart', method: 'GET', signal }),
  addItem: (body: AddCartItemRequest) => request(cartSchema, { url: '/cart/items', method: 'POST', data: body }),
  updateItem: (itemId: string, quantity: number) =>
    request(cartSchema, { url: `/cart/items/${encodeURIComponent(itemId)}`, method: 'PATCH', data: { quantity } }),
  removeItem: (itemId: string) =>
    request(cartSchema, { url: `/cart/items/${encodeURIComponent(itemId)}`, method: 'DELETE' }),
  applyCoupon: (code: string) => request(cartSchema, { url: '/cart/coupon', method: 'PUT', data: { code } }),
  removeCoupon: () => request(cartSchema, { url: '/cart/coupon', method: 'DELETE' }),
}
