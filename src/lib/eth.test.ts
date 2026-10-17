import { describe, expect, it } from 'vitest'
import {
  addEth,
  compareEth,
  formatEth,
  fromWei,
  isEthString,
  minEth,
  multiplyEth,
  percentOfEth,
  subtractEth,
  toWei,
} from './eth'

describe('eth decimal arithmetic', () => {
  it('validates decimal strings', () => {
    expect(isEthString('0')).toBe(true)
    expect(isEthString('12.000000000000000001')).toBe(true)
    expect(isEthString('01.5')).toBe(false)
    expect(isEthString('1.')).toBe(false)
    expect(isEthString('1e3')).toBe(false)
    expect(isEthString('-1')).toBe(false)
    expect(isEthString('0.0000000000000000001')).toBe(false)
  })

  it('round-trips wei without precision loss', () => {
    expect(toWei('1')).toBe(10n ** 18n)
    expect(fromWei(toWei('0.000000000000000001'))).toBe('0.000000000000000001')
    expect(fromWei(toWei('123.450'))).toBe('123.45')
  })

  it('avoids floating point drift', () => {
    expect(addEth('0.1', '0.2')).toBe('0.3')
    expect(multiplyEth('0.07', 3)).toBe('0.21')
    expect(subtractEth('1', '0.999999999999999999')).toBe('0.000000000000000001')
  })

  it('clamps subtraction at zero and rejects invalid quantities', () => {
    expect(subtractEth('0.1', '0.5')).toBe('0')
    expect(() => multiplyEth('1', 1.5)).toThrow(RangeError)
    expect(() => toWei('abc')).toThrow(RangeError)
  })

  it('computes integer percentages by truncation', () => {
    expect(percentOfEth('1.5', 10)).toBe('0.15')
    expect(percentOfEth('0.000000000000000003', 50)).toBe('0.000000000000000001')
  })

  it('compares and finds minimum values', () => {
    expect(compareEth('1.10', '1.1')).toBe(0)
    expect(compareEth('2', '1.999')).toBe(1)
    expect(minEth(['0.5', '0.25', '1'])).toBe('0.25')
    expect(minEth([])).toBeNull()
  })

  it('formats using pt-BR separators with full precision', () => {
    expect(formatEth('1234.5')).toBe('1.234,5 ETH')
    expect(formatEth('0.000000000000000001', { withUnit: false })).toBe('0,000000000000000001')
  })
})
