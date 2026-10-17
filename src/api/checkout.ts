/**
 * Checkout endpoints: wallet connection sessions, binding quotes and idempotent order creation.
 */
import {
  type CreateOrderRequest,
  type Network,
  orderListSchema,
  orderSchema,
  quoteSchema,
  walletSessionSchema,
} from './contracts'
import { request, requestVoid } from './http'

export const ORDER_REQUEST_TIMEOUT_MS = 8_000

export const checkoutApi = {
  connectWallet: (walletId: string, network: Network) =>
    request(walletSessionSchema, {
      url: `/wallets/${encodeURIComponent(walletId)}/connect`,
      method: 'POST',
      data: { network },
    }),
  disconnectWallet: (sessionId: string) =>
    requestVoid({ url: `/wallet-sessions/${encodeURIComponent(sessionId)}`, method: 'DELETE' }),
  createQuote: (network: Network) => request(quoteSchema, { url: '/checkout/quote', method: 'POST', data: { network } }),
  createOrder: (body: CreateOrderRequest, idempotencyKey: string) =>
    request(orderSchema, {
      url: '/orders',
      method: 'POST',
      data: body,
      headers: { 'Idempotency-Key': idempotencyKey },
      timeout: ORDER_REQUEST_TIMEOUT_MS,
    }),
  getOrder: (orderId: string, signal?: AbortSignal) =>
    request(orderSchema, { url: `/orders/${encodeURIComponent(orderId)}`, method: 'GET', signal }),
  listPendingOrders: (signal?: AbortSignal) =>
    request(orderListSchema, { url: '/orders', method: 'GET', params: { status: 'pending' }, signal }),
}
