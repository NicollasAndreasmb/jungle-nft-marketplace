/**
 * Shared empty and error states. Error states expose a retry action wired to the failed query.
 */
import { AlertTriangle, type LucideIcon, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { errorMessage } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ErrorState({
  title = 'Não foi possível carregar',
  error,
  onRetry,
  isRetrying,
  className,
}: {
  title?: string
  error: unknown
  onRetry?: () => void
  isRetrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-5', className)}>
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
          <RotateCw className={cn(isRetrying && 'animate-spin')} aria-hidden="true" />
          {isRetrying ? 'Tentando novamente…' : 'Tentar novamente'}
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-lg border border-dashed p-8', className)}>
      <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  )
}
