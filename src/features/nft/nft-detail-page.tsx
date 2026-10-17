/**
 * NFT detail: gallery, information, edition selection with live price/availability, bounded
 * quantity, optimistic favorite toggle and add-to-cart / buy-now actions. Handles direct access,
 * unknown NFTs, sold-out editions and per-order limits.
 */
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Heart, ImageOff, Loader2, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Edition, NftDetail } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { EthAmount } from '@/components/eth-amount'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { errorMessage } from '@/lib/error-message'
import { PageContainer } from '@/components/layout/page-container'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { useAddToCart } from '@/features/cart/cart-queries'
import { nftQueryOptions } from '@/features/catalog/catalog-queries'
import { CATEGORY_LABELS, NETWORK_LABELS } from '@/features/catalog/labels'
import { useFavorites, useToggleFavorite } from '@/features/favorites/favorites-queries'
import { useSession } from '@/features/session/session-queries'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'

const routeApi = getRouteApi('/nft/$nftId')

function Gallery({ nft }: { nft: NftDetail }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = nft.gallery[activeIndex] ?? nft.gallery[0]
  if (!active) return null
  return (
    <div className="grid gap-3">
      <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
        <img src={active.src} alt={active.alt} width={600} height={600} fetchPriority="high" className="size-full object-cover" />
      </div>
      <div className="grid grid-cols-3 gap-3" role="group" aria-label="Imagens do NFT">
        {nft.gallery.map((image, index) => (
          <button
            key={image.src}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`Mostrar imagem ${index + 1} de ${nft.gallery.length}`}
            aria-pressed={index === activeIndex}
            className={cn(
              'aspect-square overflow-hidden rounded-md border-2 border-transparent bg-muted',
              index === activeIndex ? 'border-primary' : 'opacity-75 hover:opacity-100',
            )}
          >
            <img src={image.src} alt="" width={200} height={200} loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

function FavoriteButton({ nftId }: { nftId: string }) {
  const { user } = useSession()
  const favorites = useFavorites()
  const toggle = useToggleFavorite()
  const navigate = useNavigate()
  const href = useRouterState({ select: (state) => state.location.href })
  const isFavorite = favorites.data?.nftIds.includes(nftId) ?? false

  const onClick = () => {
    if (!user) {
      toast.info('Entre na sua conta para salvar favoritos.')
      void navigate({ to: '/login', search: { redirect: href } })
      return
    }
    toggle.mutate(
      { nftId, favorite: !isFavorite },
      {
        onSuccess: (_data, variables) => toast.success(variables.favorite ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.'),
        onError: (error) => toast.error(`Não foi possível atualizar o favorito. ${errorMessage(error)}`),
      },
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={onClick}
      aria-pressed={isFavorite}
      disabled={Boolean(user) && favorites.isPending}
      data-testid="favorite-toggle"
    >
      <Heart className={cn(isFavorite && 'fill-primary text-primary')} aria-hidden="true" />
      {isFavorite ? 'Favoritado' : 'Favoritar'}
    </Button>
  )
}

function editionLimit(edition: Edition): number {
  return Math.max(0, Math.min(edition.available, edition.maxPerOrder))
}

function PurchasePanel({ nft }: { nft: NftDetail }) {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const addToCart = useAddToCart()
  const [requestedQuantity, setRequestedQuantity] = useState(1)
  const [pendingAction, setPendingAction] = useState<'cart' | 'buy' | null>(null)

  const fallbackEdition = nft.editions.find((edition) => edition.available > 0) ?? nft.editions[0]
  const edition = nft.editions.find((candidate) => candidate.id === search.edition) ?? fallbackEdition
  if (!edition) return null
  const limit = editionLimit(edition)
  const quantity = Math.min(Math.max(1, requestedQuantity), Math.max(1, limit))
  const unavailable = edition.available === 0

  const selectEdition = (editionId: string) => {
    setRequestedQuantity(1)
    void navigate({ search: { edition: editionId }, replace: true, resetScroll: false })
  }

  const submit = (action: 'cart' | 'buy') => {
    setPendingAction(action)
    addToCart.mutate(
      { nftId: nft.id, editionId: edition.id, quantity },
      {
        onSuccess: () => {
          if (action === 'buy') {
            void navigate({ to: '/checkout' })
            return
          }
          toast.success(`${nft.name} (${edition.name}) adicionado ao carrinho.`, {
            action: { label: 'Ver carrinho', onClick: () => void navigate({ to: '/carrinho' }) },
          })
        },
        onError: (error) => {
          const conflict = error instanceof ApiError && error.status === 409
          toast.error(conflict ? error.message : `Não foi possível adicionar ao carrinho. ${errorMessage(error)}`)
        },
        onSettled: () => setPendingAction(null),
      },
    )
  }

  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-semibold">Edição</legend>
        <RadioGroup value={edition.id} onValueChange={selectEdition} className="grid gap-2">
          {nft.editions.map((option) => {
            const id = `edition-${option.id}`
            const soldOut = option.available === 0
            return (
              <Label
                key={option.id}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 font-normal has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  soldOut && 'cursor-not-allowed opacity-60',
                )}
              >
                <RadioGroupItem id={id} value={option.id} disabled={soldOut} />
                <span className="flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span>
                    <span className="block font-medium">{option.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {soldOut ? 'Esgotada' : `${option.available} de ${option.supply} disponíveis`} · até {option.maxPerOrder} por pedido
                    </span>
                  </span>
                  <EthAmount value={option.priceEth} className="font-semibold" />
                </span>
              </Label>
            )
          })}
        </RadioGroup>
      </fieldset>

      <div className="grid gap-2">
        <p className="font-semibold" id="quantity-label">
          Quantidade
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <QuantityStepper
            value={quantity}
            max={Math.max(1, limit)}
            onChange={setRequestedQuantity}
            disabled={unavailable || addToCart.isPending}
            label="Quantidade"
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {unavailable ? 'Edição indisponível no momento.' : `Máximo de ${limit} nesta compra.`}
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t pt-4">
        <span className="text-sm text-muted-foreground">Preço unitário</span>
        <EthAmount value={edition.priceEth} className="text-2xl font-bold" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={() => submit('cart')} disabled={unavailable || addToCart.isPending} data-testid="add-to-cart">
          {pendingAction === 'cart' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}
          Adicionar ao carrinho
        </Button>
        <Button size="lg" variant="secondary" onClick={() => submit('buy')} disabled={unavailable || addToCart.isPending}>
          {pendingAction === 'buy' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Comprar agora
        </Button>
        <FavoriteButton nftId={nft.id} />
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-2" aria-busy="true" aria-label="Carregando NFT" data-testid="nft-detail-skeleton">
      <div className="grid gap-3">
        <Skeleton className="aspect-square w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
          <Skeleton className="aspect-square" />
        </div>
      </div>
      <div className="grid content-start gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  )
}

export function NftDetailPage() {
  const { nftId } = routeApi.useParams()
  const { data: nft, isPending, isError, error, refetch, isRefetching } = useQuery(nftQueryOptions(nftId))
  const notFound = error instanceof ApiError && error.status === 404
  useDocumentTitle(nft ? nft.name : notFound ? 'NFT não encontrado' : 'NFT')

  if (isPending) {
    return (
      <PageContainer>
        <DetailSkeleton />
      </PageContainer>
    )
  }

  if (notFound) {
    return (
      <PageContainer>
        <h1 className="mb-6 text-3xl font-bold">NFT não encontrado</h1>
        <EmptyState
          icon={ImageOff}
          title="Este NFT não existe ou foi removido"
          description="Confira o link ou volte ao catálogo para explorar outras edições."
          action={
            <Button asChild>
              <Link to="/">Voltar ao catálogo</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  if (isError || !nft) {
    return (
      <PageContainer>
        <h1 className="sr-only">Detalhes do NFT</h1>
        <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} title="Não foi possível carregar este NFT" />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <nav aria-label="Trilha de navegação" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link to="/" className="hover:text-foreground">
              Catálogo
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {nft.name}
          </li>
        </ol>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery nft={nft} />
        <div className="grid content-start gap-6">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{nft.collection.name}</Badge>
              <Badge variant="outline">{CATEGORY_LABELS[nft.category]}</Badge>
              {nft.totalAvailable === 0 ? <Badge variant="destructive">Esgotado</Badge> : null}
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl">{nft.name}</h1>
            <p className="text-muted-foreground">
              por <span className="text-foreground">{nft.creator.name}</span> · @{nft.creator.handle}
            </p>
          </div>
          <p className="leading-relaxed text-muted-foreground">{nft.description}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Rede do contrato</dt>
              <dd>{NETWORK_LABELS[nft.network]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Disponíveis</dt>
              <dd>{nft.totalAvailable}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Contrato (simulado)</dt>
              <dd className="font-mono text-xs break-all">{nft.contractAddress}</dd>
            </div>
          </dl>
          <PurchasePanel nft={nft} />
        </div>
      </div>
    </PageContainer>
  )
}
