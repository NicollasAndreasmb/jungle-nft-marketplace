/**
 * Renders an ETH decimal string with full precision and pt-BR separators.
 */
import { formatEth } from '@/lib/eth'
import { cn } from '@/lib/utils'

export function EthAmount({ value, className }: { value: string; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatEth(value)}</span>
}
