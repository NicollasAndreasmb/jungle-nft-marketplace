/**
 * Jungle marketplace wordmark with a leaf mark (inline SVG, decorative).
 */
export function BrandLogo() {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="7" fill="var(--primary)" />
        <path d="M9 22c0-8 5-13 14-13-1 8-6 13-14 13Z" fill="var(--primary-foreground)" />
        <path d="M9 22l8-7" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      Jungle<span className="sr-only"> NFT Marketplace</span>
    </span>
  )
}
