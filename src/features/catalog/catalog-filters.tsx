/**
 * Catalog filter controls (category, collection, price range, availability). Every change is
 * written to the URL and resets pagination; rendered inline on desktop and in a drawer on mobile.
 */
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { AVAILABILITY_OPTIONS, type AvailabilityFilter, CATEGORIES, type Category } from '@/api/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { compareEth, isEthString } from '@/lib/eth'
import type { CatalogSearch } from '@/app/search-params'
import { collectionsQueryOptions } from './catalog-queries'
import { AVAILABILITY_LABELS, CATEGORY_LABELS } from './labels'

export type FilterPatch = Partial<Pick<CatalogSearch, 'category' | 'collection' | 'minPrice' | 'maxPrice' | 'availability'>>

const ALL_COLLECTIONS = 'all'

function PriceRange({
  minPrice,
  maxPrice,
  onApply,
  idPrefix,
}: {
  minPrice?: string
  maxPrice?: string
  onApply: (patch: FilterPatch) => void
  idPrefix: string
}) {
  const [min, setMin] = useState(minPrice ?? '')
  const [max, setMax] = useState(maxPrice ?? '')
  const [synced, setSynced] = useState({ minPrice, maxPrice })
  const [error, setError] = useState<string | null>(null)

  if (synced.minPrice !== minPrice || synced.maxPrice !== maxPrice) {
    setSynced({ minPrice, maxPrice })
    setMin(minPrice ?? '')
    setMax(maxPrice ?? '')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedMin = min.trim().replace(',', '.')
    const normalizedMax = max.trim().replace(',', '.')
    if ((normalizedMin && !isEthString(normalizedMin)) || (normalizedMax && !isEthString(normalizedMax))) {
      setError('Use valores em ETH, por exemplo 0,25.')
      return
    }
    if (normalizedMin && normalizedMax && compareEth(normalizedMin, normalizedMax) > 0) {
      setError('O preço mínimo deve ser menor ou igual ao máximo.')
      return
    }
    setError(null)
    onApply({ minPrice: normalizedMin || undefined, maxPrice: normalizedMax || undefined })
  }

  const errorId = `${idPrefix}-price-error`
  return (
    <form onSubmit={submit} noValidate className="grid gap-2" aria-label="Faixa de preço">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-min`} className="text-xs text-muted-foreground">
            Mínimo (ETH)
          </Label>
          <Input
            id={`${idPrefix}-min`}
            inputMode="decimal"
            placeholder="0"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-max`} className="text-xs text-muted-foreground">
            Máximo (ETH)
          </Label>
          <Input
            id={`${idPrefix}-max`}
            inputMode="decimal"
            placeholder="Sem limite"
            value={max}
            onChange={(event) => setMax(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="sm">
        Aplicar preço
      </Button>
    </form>
  )
}

export function CatalogFilters({
  search,
  onChange,
  idPrefix,
}: {
  search: CatalogSearch
  onChange: (patch: FilterPatch) => void
  idPrefix: string
}) {
  const collections = useQuery(collectionsQueryOptions)
  const selected = search.category ?? []

  const toggleCategory = (category: Category, checked: boolean) => {
    const next = checked ? [...selected, category] : selected.filter((value) => value !== category)
    onChange({ category: next.length ? CATEGORIES.filter((value) => next.includes(value)) : undefined })
  }

  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Categoria</legend>
        {CATEGORIES.map((category) => {
          const id = `${idPrefix}-category-${category}`
          return (
            <div key={category} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={selected.includes(category)}
                onCheckedChange={(checked) => toggleCategory(category, checked === true)}
              />
              <Label htmlFor={id} className="font-normal">
                {CATEGORY_LABELS[category]}
              </Label>
            </div>
          )
        })}
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-collection`} className="text-sm font-semibold">
          Coleção
        </Label>
        <Select
          value={search.collection ?? ALL_COLLECTIONS}
          onValueChange={(value) => onChange({ collection: value === ALL_COLLECTIONS ? undefined : value })}
          disabled={collections.isPending}
        >
          <SelectTrigger id={`${idPrefix}-collection`} className="w-full">
            <SelectValue placeholder="Todas as coleções" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_COLLECTIONS}>Todas as coleções</SelectItem>
            {collections.data?.map((collection) => (
              <SelectItem key={collection.id} value={collection.id}>
                {collection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {collections.isError ? (
          <p className="text-xs text-destructive">
            Não foi possível carregar as coleções.{' '}
            <button type="button" className="underline" onClick={() => void collections.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Preço</legend>
        <PriceRange minPrice={search.minPrice} maxPrice={search.maxPrice} onApply={onChange} idPrefix={idPrefix} />
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Disponibilidade</legend>
        <RadioGroup
          value={search.availability ?? 'all'}
          onValueChange={(value) => onChange({ availability: value === 'all' ? undefined : (value as Exclude<AvailabilityFilter, 'all'>) })}
        >
          {AVAILABILITY_OPTIONS.map((option) => {
            const id = `${idPrefix}-availability-${option}`
            return (
              <div key={option} className="flex items-center gap-2">
                <RadioGroupItem id={id} value={option} />
                <Label htmlFor={id} className="font-normal">
                  {AVAILABILITY_LABELS[option]}
                </Label>
              </div>
            )
          })}
        </RadioGroup>
      </fieldset>
    </div>
  )
}
