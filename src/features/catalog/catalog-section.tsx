/**
 * Catalog listing bound to the URL: debounced search, combinable filters, sorting, active filter
 * chips, result count, pagination and all data states (skeleton, empty, error, background refresh).
 */
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Loader2, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { SORT_OPTIONS, type CatalogSort } from '@/api/contracts'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { NftCard, NftCardSkeleton } from '@/components/nft/nft-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'
import type { CatalogSearch } from '@/app/search-params'
import { CatalogFilters, type FilterPatch } from './catalog-filters'
import { catalogQueryOptions, collectionsQueryOptions } from './catalog-queries'
import { AVAILABILITY_LABELS, CATEGORY_LABELS, SORT_LABELS } from './labels'
import { Pagination } from './pagination'

const routeApi = getRouteApi('/')
const SEARCH_DEBOUNCE_MS = 350

function SearchBox({ value, onSearch }: { value: string | undefined; onSearch: (term: string | undefined) => void }) {
  const [term, setTerm] = useState(value ?? '')
  const [syncedValue, setSyncedValue] = useState(value)

  if (syncedValue !== value) {
    setSyncedValue(value)
    setTerm(value ?? '')
  }

  useEffect(() => {
    const normalized = term.trim() || undefined
    if (normalized === value) return
    const timer = window.setTimeout(() => onSearch(normalized), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [term, value, onSearch])

  return (
    <div className="grid flex-1 gap-1.5">
      <Label htmlFor="catalog-search" className="sr-only">
        Buscar NFTs
      </Label>
      <Input
        id="catalog-search"
        type="search"
        placeholder="Buscar por nome, coleção ou criador"
        value={term}
        maxLength={80}
        onChange={(event) => setTerm(event.target.value)}
        className="h-10"
      />
    </div>
  )
}

function ActiveFilters({ search, onChange, onClear }: { search: CatalogSearch; onChange: (patch: FilterPatch) => void; onClear: () => void }) {
  const collections = useQuery(collectionsQueryOptions)
  const chips: Array<{ key: string; label: string; remove: () => void }> = []
  search.category?.forEach((category) =>
    chips.push({
      key: `category-${category}`,
      label: CATEGORY_LABELS[category],
      remove: () => {
        const next = search.category?.filter((value) => value !== category)
        onChange({ category: next?.length ? next : undefined })
      },
    }),
  )
  if (search.collection) {
    const name = collections.data?.find((collection) => collection.id === search.collection)?.name ?? search.collection
    chips.push({ key: 'collection', label: name, remove: () => onChange({ collection: undefined }) })
  }
  if (search.minPrice) chips.push({ key: 'min', label: `Mín. ${formatEth(search.minPrice)}`, remove: () => onChange({ minPrice: undefined }) })
  if (search.maxPrice) chips.push({ key: 'max', label: `Máx. ${formatEth(search.maxPrice)}`, remove: () => onChange({ maxPrice: undefined }) })
  if (search.availability) {
    chips.push({ key: 'availability', label: AVAILABILITY_LABELS[search.availability], remove: () => onChange({ availability: undefined }) })
  }
  if (!chips.length && !search.q) return null
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
      {search.q ? <span className="text-sm text-muted-foreground">Busca: “{search.q}”</span> : null}
      {chips.map((chip) => (
        <Button key={chip.key} variant="secondary" size="xs" onClick={chip.remove} aria-label={`Remover filtro ${chip.label}`}>
          {chip.label}
          <X aria-hidden="true" />
        </Button>
      ))}
      <Button variant="link" size="xs" onClick={onClear}>
        Limpar tudo
      </Button>
    </div>
  )
}

export function CatalogSection() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const query = useQuery(catalogQueryOptions(search))
  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData, isRefetching } = query

  const update = (patch: Partial<CatalogSearch>, options: { replace?: boolean } = {}) =>
    void navigate({ search: (previous) => ({ ...previous, ...patch, page: undefined }), replace: options.replace, resetScroll: false })

  const onSearch = useCallback(
    (term: string | undefined) =>
      void navigate({ search: (previous) => ({ ...previous, q: term, page: undefined }), resetScroll: false }),
    [navigate],
  )
  const clearAll = () => void navigate({ search: { sort: search.sort }, resetScroll: false })
  const activeFilterCount =
    (search.category?.length ?? 0) + (search.collection ? 1 : 0) + (search.minPrice || search.maxPrice ? 1 : 0) + (search.availability ? 1 : 0)

  return (
    <section id="catalogo" aria-labelledby="catalogo-titulo" className="scroll-mt-20">
      <div className="mb-6 flex flex-col gap-1">
        <h2 id="catalogo-titulo" className="text-2xl font-bold">
          Catálogo
        </h2>
        <p className="text-sm text-muted-foreground">Busque, filtre e ordene as edições disponíveis.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filtros do catálogo">
          <CatalogFilters search={search} onChange={update} idPrefix="desktop" />
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <SearchBox value={search.q} onSearch={onSearch} />
            <div className="flex gap-2">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-10 lg:hidden">
                    <SlidersHorizontal aria-hidden="true" />
                    Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(22rem,100vw)] overflow-y-auto">
                  <SheetHeader className="px-0">
                    <SheetTitle>Filtros</SheetTitle>
                    <SheetDescription>As alterações são aplicadas imediatamente.</SheetDescription>
                  </SheetHeader>
                  <CatalogFilters search={search} onChange={update} idPrefix="mobile" />
                  <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
                    Ver {data?.total ?? ''} resultados
                  </Button>
                </SheetContent>
              </Sheet>
              <div className="grid gap-1.5">
                <Label htmlFor="catalog-sort" className="sr-only">
                  Ordenar por
                </Label>
                <Select
                  value={search.sort ?? 'recent'}
                  onValueChange={(value) => update({ sort: value === 'recent' ? undefined : (value as Exclude<CatalogSort, 'recent'>) })}
                >
                  <SelectTrigger id="catalog-sort" className="h-10 min-w-44" aria-label="Ordenar por">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {SORT_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-2">
            <ActiveFilters search={search} onChange={update} onClear={clearAll} />
            <p className="ml-auto flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite" data-testid="catalog-count">
              {isFetching && !isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {isFetching && !isPending ? 'Atualizando resultados…' : data ? `${data.total} ${data.total === 1 ? 'NFT encontrado' : 'NFTs encontrados'}` : ''}
            </p>
          </div>

          {isError && !data ? (
            <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} title="Não foi possível carregar o catálogo" />
          ) : isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Carregando catálogo">
              {Array.from({ length: 6 }, (_, index) => (
                <NftCardSkeleton key={index} />
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum NFT encontrado"
              description={
                data.total === 0 && !activeFilterCount && !search.q
                  ? 'O catálogo ainda não tem itens publicados.'
                  : 'Tente outros termos ou remova alguns filtros.'
              }
              action={
                activeFilterCount || search.q ? (
                  <Button variant="outline" onClick={clearAll}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {isError ? (
                <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} title="Falha ao atualizar" className="mb-4" />
              ) : null}
              <ul
                className={cn('grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3', isPlaceholderData && 'opacity-60')}
                aria-busy={isPlaceholderData}
                data-testid="catalog-grid"
              >
                {data.items.map((nft) => (
                  <li key={nft.id}>
                    <NftCard nft={nft} />
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} totalPages={data.totalPages} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}
