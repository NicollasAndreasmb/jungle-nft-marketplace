/**
 * Applies accepted realtime events to the TanStack Query cache and reconciles after reconnects.
 *
 * Patches are guarded by resource version, so a cached REST payload that is already newer is
 * never regressed. Cart and order data are invalidated (the server recomputes totals) and the
 * function reports human-readable notices for affected cart lines.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { Cart, CatalogPage, Favorites, NftDetail, NftSummary, NftUpdatedEvent, OrderUpdatedEvent } from '@/api/contracts'
import { queryKeys } from '@/api/query-keys'
import { compareEth, formatEth } from '@/lib/eth'

function patchSummary(item: NftSummary, event: NftUpdatedEvent): NftSummary {
  if (item.id !== event.resource.id || item.version >= event.version) return item
  return { ...item, fromPriceEth: event.data.fromPriceEth, totalAvailable: event.data.totalAvailable, version: event.version }
}

function cartNotices(cart: Cart | undefined, event: NftUpdatedEvent): string[] {
  if (!cart) return []
  return cart.items
    .filter((item) => item.nftId === event.resource.id)
    .flatMap((item) => {
      const edition = event.data.editions.find((candidate) => candidate.id === item.editionId)
      if (!edition) return []
      if (edition.available === 0) return [`${item.nftName} (${item.editionName}) esgotou. Remova o item para continuar.`]
      if (compareEth(edition.priceEth, item.unitPriceEth) !== 0) {
        return [`O preço de ${item.nftName} (${item.editionName}) mudou de ${formatEth(item.unitPriceEth)} para ${formatEth(edition.priceEth)}.`]
      }
      if (edition.available < item.quantity) {
        return [`Restam apenas ${edition.available} unidade(s) de ${item.nftName} (${item.editionName}).`]
      }
      return []
    })
}

export function applyNftUpdated(queryClient: QueryClient, event: NftUpdatedEvent, cartScopeKey: string): string[] {
  const nftId = event.resource.id

  queryClient.setQueryData<NftDetail>(queryKeys.nft(nftId), (current) => {
    if (!current || current.version >= event.version) return current
    return {
      ...current,
      version: event.version,
      fromPriceEth: event.data.fromPriceEth,
      totalAvailable: event.data.totalAvailable,
      editions: current.editions.map((edition) => {
        const update = event.data.editions.find((candidate) => candidate.id === edition.id)
        return update ? { ...edition, priceEth: update.priceEth, available: update.available } : edition
      }),
    }
  })

  queryClient.setQueriesData<CatalogPage>({ queryKey: queryKeys.catalogRoot }, (page) =>
    page ? { ...page, items: page.items.map((item) => patchSummary(item, event)) } : page,
  )
  queryClient.setQueryData<NftSummary[]>(queryKeys.highlights, (items) => items?.map((item) => patchSummary(item, event)))
  queryClient.setQueriesData<Favorites>({ queryKey: queryKeys.privateRoot, predicate: (query) => query.queryKey[2] === 'favorites' }, (favorites) =>
    favorites ? { ...favorites, items: favorites.items.map((item) => patchSummary(item, event)) } : favorites,
  )
  void queryClient.invalidateQueries({ queryKey: queryKeys.catalogRoot, refetchType: 'none' })

  const cartKey = queryKeys.cart(cartScopeKey)
  const cart = queryClient.getQueryData<Cart>(cartKey)
  const notices = cartNotices(cart, event)
  if (cart?.items.some((item) => item.nftId === nftId)) {
    void queryClient.invalidateQueries({ queryKey: cartKey })
  }
  return notices
}

export function applyOrderUpdated(queryClient: QueryClient, event: OrderUpdatedEvent, userId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.order(userId, event.resource.id) })
  void queryClient.invalidateQueries({ queryKey: queryKeys.pendingOrders(userId) })
  if (event.data.status === 'confirmed') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) })
  }
}

export function reconcileAfterReconnect(queryClient: QueryClient, userId: string | null): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.nftRoot })
  void queryClient.invalidateQueries({ queryKey: queryKeys.catalogRoot })
  void queryClient.invalidateQueries({ queryKey: queryKeys.highlights })
  void queryClient.invalidateQueries({ queryKey: queryKeys.cartRoot })
  if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.orderRoot(userId) })
}
