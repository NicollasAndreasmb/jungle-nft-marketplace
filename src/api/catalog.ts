/**
 * Catalog endpoints: paginated listing with search/filters/sort, highlights, collections and NFT detail.
 */
import {
  type CatalogQuery,
  catalogPageSchema,
  collectionListSchema,
  highlightListSchema,
  nftDetailSchema,
} from './contracts'
import { request } from './http'

export function toCatalogParams(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  query.category?.forEach((category) => params.append('category', category))
  if (query.collection) params.set('collection', query.collection)
  if (query.minPrice) params.set('minPrice', query.minPrice)
  if (query.maxPrice) params.set('maxPrice', query.maxPrice)
  if (query.availability && query.availability !== 'all') params.set('availability', query.availability)
  if (query.sort) params.set('sort', query.sort)
  params.set('page', String(query.page ?? 1))
  return params
}

export const catalogApi = {
  list: (query: CatalogQuery, signal?: AbortSignal) =>
    request(catalogPageSchema, { url: '/nfts', method: 'GET', params: toCatalogParams(query), signal }),
  highlights: (signal?: AbortSignal) => request(highlightListSchema, { url: '/nfts/highlights', method: 'GET', signal }),
  collections: (signal?: AbortSignal) => request(collectionListSchema, { url: '/collections', method: 'GET', signal }),
  detail: (nftId: string, signal?: AbortSignal) =>
    request(nftDetailSchema, { url: `/nfts/${encodeURIComponent(nftId)}`, method: 'GET', signal }),
}
