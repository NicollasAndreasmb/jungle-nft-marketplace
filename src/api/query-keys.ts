/**
 * Query key factory. Public data is keyed by resource and parameters; private data is nested
 * under ['user', userId] so it can be dropped in one call on logout or user switch.
 */
import type { CatalogQuery } from './contracts'

export const queryKeys = {
  session: ['session'] as const,
  catalogRoot: ['catalog'] as const,
  catalog: (query: CatalogQuery) => ['catalog', query] as const,
  highlights: ['highlights'] as const,
  collections: ['collections'] as const,
  nftRoot: ['nft'] as const,
  nft: (nftId: string) => ['nft', nftId] as const,
  cartRoot: ['cart'] as const,
  cart: (scope: string) => ['cart', scope] as const,
  privateRoot: ['user'] as const,
  privateScope: (userId: string) => ['user', userId] as const,
  favorites: (userId: string) => ['user', userId, 'favorites'] as const,
  profile: (userId: string) => ['user', userId, 'profile'] as const,
  wallets: (userId: string) => ['user', userId, 'wallets'] as const,
  orderRoot: (userId: string) => ['user', userId, 'orders'] as const,
  order: (userId: string, orderId: string) => ['user', userId, 'orders', orderId] as const,
  pendingOrders: (userId: string) => ['user', userId, 'orders', 'pending'] as const,
}

export function cartScope(userId: string | null | undefined): string {
  return userId ?? 'guest'
}
