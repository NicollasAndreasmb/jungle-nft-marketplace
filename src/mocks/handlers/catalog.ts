/**
 * Mock handlers for the public catalog: paginated listing with search, combinable filters and
 * sorting, featured highlights, collection list and NFT detail.
 */
import { HttpResponse } from 'msw'
import {
  AVAILABILITY_OPTIONS,
  CATALOG_PAGE_SIZE,
  CATEGORIES,
  type Category,
  SORT_OPTIONS,
  catalogQuerySchema,
} from '@/api/contracts'
import { compareEth, isEthString } from '@/lib/eth'
import { db } from '../db'
import { COLLECTIONS } from '../fixtures'
import { collectionName, findNft, fromPrice, toNftDetail, toNftSummary, totalAvailable } from '../domain'
import { HttpProblem, route } from '../http'
import { getScenario } from '../scenarios'

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function readQuery(url: URL) {
  const params = url.searchParams
  const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
    allowed.includes(value as T) ? (value as T) : undefined
  const rawPage = Number(params.get('page') ?? '1')
  const candidate = {
    q: params.get('q') ?? undefined,
    category: params.getAll('category').filter((value): value is Category => CATEGORIES.includes(value as Category)),
    collection: params.get('collection') ?? undefined,
    minPrice: params.get('minPrice') ?? undefined,
    maxPrice: params.get('maxPrice') ?? undefined,
    availability: pick(params.get('availability'), AVAILABILITY_OPTIONS),
    sort: pick(params.get('sort'), SORT_OPTIONS),
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  }
  const parsed = catalogQuerySchema.safeParse(candidate)
  if (!parsed.success) {
    throw new HttpProblem(400, 'INVALID_QUERY', 'Parâmetros de busca inválidos.')
  }
  return parsed.data
}

export const catalogHandlers = [
  route('get', '/nfts', ({ url }) => {
    const query = readQuery(url)
    const term = query.q ? normalize(query.q) : ''
    const empty = getScenario().flags.emptyCatalog

    const filtered = (empty ? [] : db().nfts).filter((nft) => {
      if (term) {
        const haystack = normalize(`${nft.name} ${collectionName(nft.collectionId)} ${nft.creator.name}`)
        if (!haystack.includes(term)) return false
      }
      if (query.category?.length && !query.category.includes(nft.category)) return false
      if (query.collection && nft.collectionId !== query.collection) return false
      const price = fromPrice(nft)
      if (query.minPrice && isEthString(query.minPrice) && (price === null || compareEth(price, query.minPrice) < 0)) return false
      if (query.maxPrice && isEthString(query.maxPrice) && (price === null || compareEth(price, query.maxPrice) > 0)) return false
      if (query.availability === 'available' && totalAvailable(nft) === 0) return false
      if (query.availability === 'sold-out' && totalAvailable(nft) > 0) return false
      return true
    })

    const sorted = [...filtered].sort((left, right) => {
      switch (query.sort) {
        case 'price-asc':
        case 'price-desc': {
          const leftPrice = fromPrice(left)
          const rightPrice = fromPrice(right)
          if (leftPrice === null && rightPrice === null) return left.id.localeCompare(right.id)
          if (leftPrice === null) return 1
          if (rightPrice === null) return -1
          const order = compareEth(leftPrice, rightPrice) || left.id.localeCompare(right.id)
          return query.sort === 'price-asc' ? order : -order
        }
        case 'name':
          return left.name.localeCompare(right.name, 'pt-BR')
        default:
          return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)
      }
    })

    const total = sorted.length
    const totalPages = Math.ceil(total / CATALOG_PAGE_SIZE)
    const page = query.page ?? 1
    const start = (page - 1) * CATALOG_PAGE_SIZE
    return HttpResponse.json({
      items: sorted.slice(start, start + CATALOG_PAGE_SIZE).map(toNftSummary),
      page,
      pageSize: CATALOG_PAGE_SIZE,
      total,
      totalPages,
    })
  }),

  route('get', '/nfts/highlights', () => {
    if (getScenario().flags.emptyCatalog) return HttpResponse.json([])
    return HttpResponse.json(db().nfts.filter((nft) => nft.featured).map(toNftSummary))
  }),

  route('get', '/collections', () => HttpResponse.json(COLLECTIONS.map(({ id, name }) => ({ id, name })))),

  route('get', '/nfts/:nftId', ({ params }) => {
    if (getScenario().flags.emptyCatalog) throw new HttpProblem(404, 'NFT_NOT_FOUND', 'NFT não encontrado.')
    return HttpResponse.json(toNftDetail(findNft(params.nftId ?? '')))
  }),
]
