/**
 * Lists what changed between the reviewed quote and the current catalog (price, availability,
 * coupon), shown when the checkout requires a new confirmation.
 */
import type { QuoteChange } from '@/api/contracts'
import { formatEth } from '@/lib/eth'

function describe(change: QuoteChange): string {
  const item = `${change.nftName} (${change.editionName})`
  switch (change.kind) {
    case 'price-changed':
      return `${item}: preço mudou de ${formatEth(change.previousUnitPriceEth ?? '0')} para ${formatEth(change.currentUnitPriceEth ?? '0')}.`
    case 'insufficient':
      return `${item}: restam apenas ${change.available ?? 0} unidade(s).`
    case 'sold-out':
      return `${item}: edição esgotada.`
    case 'coupon-invalid':
      return `O cupom ${change.nftName} não é mais válido.`
  }
}

export function QuoteChanges({ changes }: { changes: QuoteChange[] }) {
  if (changes.length === 0) return null
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="quote-changes">
      {changes.map((change) => (
        <li key={`${change.kind}-${change.editionId}-${change.nftName}`}>{describe(change)}</li>
      ))}
    </ul>
  )
}
