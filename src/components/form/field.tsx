/**
 * Accessible form field: associates label, hint and error message with the control through
 * `id`, `aria-describedby` and `aria-invalid` (passed to the render-prop child).
 */
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface FieldControlProps {
  id: string
  name: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
}

export function Field({
  name,
  label,
  error,
  hint,
  className,
  children,
}: {
  name: string
  label: string
  error?: string
  hint?: string
  className?: string
  children: (props: FieldControlProps) => ReactNode
}) {
  const id = `field-${name}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, name, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
      {message}
    </p>
  )
}
