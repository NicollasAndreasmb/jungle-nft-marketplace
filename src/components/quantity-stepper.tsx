/**
 * Integer quantity control bounded by [min, max] with accessible decrement/increment buttons.
 */
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled,
  label,
}: {
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  label: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-md border">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Diminuir quantidade"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus aria-hidden="true" />
      </Button>
      <output aria-live="polite" className="min-w-10 text-center text-sm font-medium tabular-nums">
        {value}
      </output>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Aumentar quantidade"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}
