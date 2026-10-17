/**
 * Featured NFTs at the top of the home page (first item is the LCP image and loads eagerly).
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { EthAmount } from '@/components/eth-amount'
import { ErrorState } from '@/components/feedback/states'
import { NftCard, NftCardSkeleton } from '@/components/nft/nft-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { highlightsQueryOptions } from './catalog-queries'

export function HighlightsSection() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery(highlightsQueryOptions)
  const [lead, ...rest] = data ?? []

  return (
    <section aria-labelledby="destaques-titulo" className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-stretch">
      <div className="flex flex-col justify-center gap-5 py-4">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Marketplace de colecionáveis digitais</p>
        <h1 className="text-4xl leading-tight font-bold sm:text-5xl">Edições limitadas de criadores independentes</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Explore arte generativa, games, música e fotografia. Compare edições, acompanhe a disponibilidade em tempo real e
          finalize a compra com a sua carteira.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="#catalogo">Explorar catálogo</a>
          </Button>
          {lead ? (
            <Button asChild size="lg" variant="outline">
              <Link to="/nft/$nftId" params={{ nftId: lead.id }}>
                Ver destaque
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <h2 id="destaques-titulo" className="mb-3 text-lg font-semibold">
          Destaques
        </h2>
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} title="Não foi possível carregar os destaques" />
        ) : isPending ? (
          <div className="grid grid-cols-2 gap-4" aria-busy="true" aria-label="Carregando destaques">
            <Skeleton className="col-span-2 aspect-[16/9] w-full sm:aspect-[2/1]" />
            <NftCardSkeleton />
            <NftCardSkeleton />
          </div>
        ) : !lead ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Nenhum destaque disponível no momento.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Link
              to="/nft/$nftId"
              params={{ nftId: lead.id }}
              className="group relative col-span-2 overflow-hidden rounded-lg border"
            >
              <img
                src={lead.image.src}
                alt={lead.image.alt}
                width={600}
                height={600}
                fetchPriority="high"
                className="aspect-[16/9] w-full object-cover sm:aspect-[2/1]"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-background/85 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{lead.collection.name}</p>
                  <p className="font-display text-lg font-semibold">{lead.name}</p>
                </div>
                {lead.fromPriceEth ? <EthAmount value={lead.fromPriceEth} className="font-semibold" /> : <span>Esgotado</span>}
              </div>
            </Link>
            {rest.slice(0, 2).map((nft) => (
              <NftCard key={nft.id} nft={nft} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
