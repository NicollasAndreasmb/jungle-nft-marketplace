/**
 * URL search param handling for the router: flat, human-readable query strings (repeated keys
 * for arrays) and tolerant parsers that drop invalid values instead of breaking the page.
 */
import { z } from 'zod'
import {
  type CatalogQuery,
  availabilitySchema,
  categorySchema,
  ethAmount,
  sortSchema,
} from '@/api/contracts'

export function parseSearchString(searchStr: string): Record<string, unknown> {
  const params = new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr)
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    result[key] = values.length > 1 ? values : (values[0] ?? '')
  }
  return result
}

export function stringifySearchObject(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)))
    } else {
      params.set(key, String(value))
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value])

function pickValid<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export type CatalogSearch = CatalogQuery

export function parseCatalogSearch(raw: Record<string, unknown>): CatalogSearch {
  const categories = asArray(raw.category)
    .map((value) => pickValid(categorySchema, value))
    .filter((value) => value !== undefined)
  const page = pickValid(z.coerce.number().int().min(1).max(1000), raw.page)
  const q = pickValid(z.string().trim().min(1).max(80), raw.q)
  return {
    q,
    category: categories.length ? [...new Set(categories)] : undefined,
    collection: pickValid(z.string().min(1).max(64).regex(/^[a-z0-9-]+$/), raw.collection),
    minPrice: pickValid(ethAmount, raw.minPrice),
    maxPrice: pickValid(ethAmount, raw.maxPrice),
    availability: pickValid(availabilitySchema.exclude(['all']), raw.availability),
    sort: pickValid(sortSchema.exclude(['recent']), raw.sort),
    page: page && page > 1 ? page : undefined,
  }
}

export function parseRedirectSearch(raw: Record<string, unknown>): { redirect?: string; reason?: 'expired' } {
  return {
    redirect: pickValid(z.string().max(2048), raw.redirect),
    reason: raw.reason === 'expired' ? 'expired' : undefined,
  }
}
