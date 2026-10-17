/**
 * Application shell: skip link, header, routed content, footer, toasts, the session expiry
 * watcher, the pending-order recovery banner and (when mocks are enabled) the scenario panel.
 * After client-side navigation, moves focus to <main> and then to the page heading once it renders
 * (unless the user has already moved focus).
 */
import { Outlet, useRouterState } from '@tanstack/react-router'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { Toaster } from '@/components/ui/sonner'
import { PendingOrderBanner } from '@/features/orders/pending-order-banner'
import { SessionWatcher } from '@/features/session/session-watcher'

const MockPanel = import.meta.env.VITE_ENABLE_MOCKS === 'true' ? lazy(() => import('@/mocks/panel/mock-panel')) : null

const HEADING_WAIT_MS = 5_000

function focusHeading(heading: HTMLElement) {
  heading.setAttribute('tabindex', '-1')
  heading.focus({ preventScroll: true })
}

function useFocusOnNavigation() {
  const pathname = useRouterState({ select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname })
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const main = document.getElementById('conteudo')
    if (!main) return
    const focusIsUnclaimed = () => document.activeElement === document.body || document.activeElement === main || !document.activeElement
    const tryFocus = () => {
      const heading = main.querySelector<HTMLElement>('h1')
      if (!heading) return false
      if (focusIsUnclaimed()) focusHeading(heading)
      return true
    }
    main.focus({ preventScroll: true })
    if (tryFocus()) return
    const observer = new MutationObserver(() => {
      if (tryFocus()) observer.disconnect()
    })
    observer.observe(main, { childList: true, subtree: true })
    const timer = window.setTimeout(() => observer.disconnect(), HEADING_WAIT_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [pathname])
}

export function RootLayout() {
  useFocusOnNavigation()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <PendingOrderBanner />
      <main id="conteudo" className="flex-1 outline-none" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
      <SessionWatcher />
      <Toaster position="bottom-right" closeButton />
      {MockPanel ? (
        <Suspense fallback={null}>
          <MockPanel />
        </Suspense>
      ) : null}
    </div>
  )
}
