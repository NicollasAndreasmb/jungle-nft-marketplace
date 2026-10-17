import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safe-redirect'

describe('safeRedirectPath', () => {
  it('keeps relative app paths with search and hash', () => {
    expect(safeRedirectPath('/checkout?step=review#top')).toBe('/checkout?step=review#top')
  })

  it('rejects absolute, protocol-relative and backslash URLs', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/')
    expect(safeRedirectPath('//evil.example/path')).toBe('/')
    expect(safeRedirectPath('/\\evil.example')).toBe('/')
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/')
  })

  it('avoids redirect loops to auth pages and handles non-strings', () => {
    expect(safeRedirectPath('/login?redirect=/x')).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
  })
})
