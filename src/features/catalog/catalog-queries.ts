/**
 * Query options for public catalog data. Listing keeps the previous page visible while the next
 * parameters load; each parameter set has its own cache entry, so slow, out-of-order responses
 * can never overwrite the results of a newer query. Abort signals cancel superseded requests.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { catalogApi } from '@/api/catalog'
import type { CatalogQuery } from '@/api/contracts'
import { queryKeys } from '@/api/query-keys'

export const catalogQueryOptions = (query: CatalogQuery) =>
  queryOptions({
    queryKey: queryKeys.catalog(query),
    queryFn: ({ signal }) => catalogApi.list(query, signal),
    placeholderData: keepPreviousData,
  })

export const highlightsQueryOptions = queryOptions({
  queryKey: queryKeys.highlights,
  queryFn: ({ signal }) => catalogApi.highlights(signal),
})

export const collectionsQueryOptions = queryOptions({
  queryKey: queryKeys.collections,
  queryFn: ({ signal }) => catalogApi.collections(signal),
  staleTime: 10 * 60_000,
})

export const nftQueryOptions = (nftId: string) =>
  queryOptions({
    queryKey: queryKeys.nft(nftId),
    queryFn: ({ signal }) => catalogApi.detail(nftId, signal),
  })
