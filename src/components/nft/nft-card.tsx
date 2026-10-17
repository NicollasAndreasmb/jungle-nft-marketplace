/**
 * Catalog card: artwork, name, collection, creator and starting price or sold-out status.
 * The whole card is a single link to the NFT detail; dimensions are fixed to avoid layout shift.
 */
import { Link } from '@tanstack/react-router'
import type { NftSummary } from '@/api/contracts'
import { EthAmount } from '@/components/eth-amount'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function NftCard({ nft, priority = false }: { nft: NftSummary; priority?: boolean }) {
  const soldOut = nft.totalAvailable === 0
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/60 focus-within:border-primary">
      <div className="aspect-square overflow-hidden bg-muted">
        <img
          src={nft.image.src}
          alt={nft.image.alt}
          width={600}
          height={600}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          className={cn('size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]', soldOut && 'opacity-70')}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs text-muted-foreground">{nft.collection.name}</p>
        <h3 className="font-display text-base leading-snug font-semibold">
          <Link
            to="/nft/$nftId"
            params={{ nftId: nft.id }}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {nft.name}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">por {nft.creator.name}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          {soldOut || !nft.fromPriceEth ? (
            <span className="text-sm font-medium text-muted-foreground">Esgotado</span>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">A partir de</p>
              <EthAmount value={nft.fromPriceEth} className="font-semibold" />
            </div>
          )}
          <span className="text-xs text-muted-foreground">{soldOut ? '0 disponíveis' : `${nft.totalAvailable} disponíveis`}</span>
        </div>
      </div>
    </article>
  )
}

export function NftCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card" data-testid="nft-card-skeleton">
      <Skeleton className="aspect-square rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-28" />
        <div className="flex justify-between pt-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-3 w-16 self-end" />
        </div>
      </div>
    </div>
  )
}
