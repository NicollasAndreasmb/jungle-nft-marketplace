/**
 * Route tree (TanStack Router, code-based) with typed search params, auth guards for private
 * flows (checkout, orders, profile, wallets) that preserve the return path, lazy-loaded screens
 * and a not-found route.
 */
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type ParsedLocation,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'
import { sessionQueryOptions } from '@/features/session/session-queries'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { RootLayout } from './root-layout'
import { NotFoundPage } from './not-found-page'
import { parseCatalogSearch, parseRedirectSearch, parseSearchString, stringifySearchObject } from './search-params'

export interface RouterContext {
  queryClient: QueryClient
}

async function requireAuth({ context, location }: { context: RouterContext; location: ParsedLocation }) {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
  if (!session) {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
}

async function redirectIfAuthenticated({ context, search }: { context: RouterContext; search: { redirect?: string } }) {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
  if (session) {
    throw redirect({ href: safeRedirectPath(search.redirect) })
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: parseCatalogSearch,
  component: lazyRouteComponent(() => import('@/features/catalog/home-page'), 'HomePage'),
})

const nftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/nft/$nftId',
  validateSearch: (raw: Record<string, unknown>): { edition?: string } => ({
    edition: z.string().max(80).optional().catch(undefined).parse(raw.edition),
  }),
  component: lazyRouteComponent(() => import('@/features/nft/nft-detail-page'), 'NftDetailPage'),
})

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carrinho',
  component: lazyRouteComponent(() => import('@/features/cart/cart-page'), 'CartPage'),
})

const CHECKOUT_STEPS = ['dados', 'carteira', 'revisao'] as const
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/checkout',
  validateSearch: (raw: Record<string, unknown>): { step?: CheckoutStep } => ({
    step: z.enum(CHECKOUT_STEPS).optional().catch(undefined).parse(raw.step),
  }),
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/features/checkout/checkout-page'), 'CheckoutPage'),
})

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pedidos/$orderId',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/features/orders/order-page'), 'OrderPage'),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: parseRedirectSearch,
  beforeLoad: redirectIfAuthenticated,
  component: lazyRouteComponent(() => import('@/features/session/login-page'), 'LoginPage'),
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  validateSearch: parseRedirectSearch,
  beforeLoad: redirectIfAuthenticated,
  component: lazyRouteComponent(() => import('@/features/session/register-page'), 'RegisterPage'),
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/perfil',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/features/profile/profile-page'), 'ProfilePage'),
})

const walletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/carteiras',
  beforeLoad: requireAuth,
  component: lazyRouteComponent(() => import('@/features/wallets/wallets-page'), 'WalletsPage'),
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  nftRoute,
  cartRoute,
  checkoutRoute,
  orderRoute,
  loginRoute,
  registerRoute,
  profileRoute,
  walletsRoute,
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    parseSearch: parseSearchString,
    stringifySearch: stringifySearchObject,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
