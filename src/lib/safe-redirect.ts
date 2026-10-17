/**
 * Validates post-login return paths so only same-origin relative app paths are honored,
 * preventing open redirects through the `redirect` search parameter.
 */
const FALLBACK = '/'

export function safeRedirectPath(candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 2048) return FALLBACK
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return FALLBACK
  try {
    const url = new URL(candidate, 'https://app.invalid')
    if (url.origin !== 'https://app.invalid') return FALLBACK
    if (url.pathname.startsWith('/login') || url.pathname.startsWith('/cadastro')) return FALLBACK
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return FALLBACK
  }
}
