/**
 * Page navigation built from links so pages are shareable and restorable from history.
 */
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function pageWindow(current: number, total: number): Array<number | 'gap'> {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))
  const sorted = [...pages].sort((left, right) => left - right)
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1]
    return previous !== undefined && page - previous > 1 ? (['gap', page] as const) : [page]
  })
}

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null
  const toPage = (target: number) => ({ to: '/' as const, search: (previous: Record<string, unknown>) => ({ ...previous, page: target > 1 ? target : undefined }), hash: 'catalogo' })
  return (
    <nav aria-label="Paginação do catálogo" className="mt-8 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link {...toPage(page - 1)} className={buttonVariants({ variant: 'ghost', size: 'sm' })} aria-label="Página anterior">
          <ChevronLeft aria-hidden="true" /> <span className="hidden sm:inline">Anterior</span>
        </Link>
      ) : null}
      {pageWindow(page, totalPages).map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-2 text-muted-foreground" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={entry}
            {...toPage(entry)}
            aria-current={entry === page ? 'page' : undefined}
            aria-label={`Página ${entry}`}
            className={cn(buttonVariants({ variant: entry === page ? 'default' : 'ghost', size: 'icon-sm' }))}
          >
            {entry}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link {...toPage(page + 1)} className={buttonVariants({ variant: 'ghost', size: 'sm' })} aria-label="Próxima página">
          <span className="hidden sm:inline">Próxima</span> <ChevronRight aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  )
}
