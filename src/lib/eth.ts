/**
 * Exact ETH arithmetic over decimal strings.
 *
 * Values travel as decimal strings (e.g. "0.125") and are converted to bigint wei
 * (18 decimals) for every calculation, so no floating point is ever involved.
 * Exposes parsing, validation, arithmetic helpers and pt-BR formatting.
 */

export const ETH_DECIMALS = 18
const WEI_PER_ETH = 10n ** BigInt(ETH_DECIMALS)
const ETH_DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d{1,18})?$/

export type EthString = string

export function isEthString(value: string): boolean {
  return ETH_DECIMAL_PATTERN.test(value)
}

export function toWei(value: EthString): bigint {
  if (!isEthString(value)) {
    throw new RangeError(`Invalid ETH decimal string: "${value}"`)
  }
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole) * WEI_PER_ETH + BigInt(fraction.padEnd(ETH_DECIMALS, '0'))
}

export function fromWei(wei: bigint): EthString {
  if (wei < 0n) {
    throw new RangeError('Negative ETH amounts are not supported')
  }
  const whole = wei / WEI_PER_ETH
  const fraction = (wei % WEI_PER_ETH).toString().padStart(ETH_DECIMALS, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function addEth(...values: EthString[]): EthString {
  return fromWei(values.reduce((sum, value) => sum + toWei(value), 0n))
}

export function subtractEth(minuend: EthString, subtrahend: EthString): EthString {
  const result = toWei(minuend) - toWei(subtrahend)
  return fromWei(result < 0n ? 0n : result)
}

export function multiplyEth(value: EthString, quantity: number): EthString {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError('Quantity must be a non-negative integer')
  }
  return fromWei(toWei(value) * BigInt(quantity))
}

export function percentOfEth(value: EthString, percent: number): EthString {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError('Percent must be an integer between 0 and 100')
  }
  return fromWei((toWei(value) * BigInt(percent)) / 100n)
}

export function compareEth(left: EthString, right: EthString): -1 | 0 | 1 {
  const difference = toWei(left) - toWei(right)
  if (difference === 0n) return 0
  return difference > 0n ? 1 : -1
}

export function minEth(values: EthString[]): EthString | null {
  return values.reduce<EthString | null>(
    (current, value) => (current === null || compareEth(value, current) < 0 ? value : current),
    null,
  )
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatEth(value: EthString, options: { withUnit?: boolean } = {}): string {
  const normalized = fromWei(toWei(value))
  const [whole = '0', fraction] = normalized.split('.')
  const formatted = fraction ? `${groupThousands(whole)},${fraction}` : groupThousands(whole)
  return options.withUnit === false ? formatted : `${formatted} ETH`
}
