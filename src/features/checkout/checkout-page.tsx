/**
 * Checkout orchestrator: step navigation kept in the URL (dados → carteira → revisão), step
 * guards, persisted collector draft and wallet connection, cart summary, and hand-off to the
 * order status page once the API accepts the order.
 */
import { getRouteApi, Link } from '@tanstack/react-router'
import { Check, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { type Collector, type Order, type User, collectorSchema } from '@/api/contracts'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageContainer } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CheckoutStep } from '@/app/router'
import { OrderSummaryRows } from '@/features/cart/cart-page'
import { useCart } from '@/features/cart/cart-queries'
import { NETWORK_LABELS } from '@/features/catalog/labels'
import { useSession } from '@/features/session/session-queries'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { type StoredWalletSession, checkoutStorage } from './checkout-storage'
import { CollectorStep } from './collector-step'
import { ReviewStep } from './review-step'
import { WalletStep } from './wallet-step'
import { useWallets } from '@/features/wallets/wallet-queries'

const routeApi = getRouteApi('/checkout')

const STEPS: Array<{ id: CheckoutStep; label: string }> = [
  { id: 'dados', label: 'Dados' },
  { id: 'carteira', label: 'Carteira e rede' },
  { id: 'revisao', label: 'Revisão' },
]

function StepIndicator({ current }: { current: CheckoutStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current)
  return (
    <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Etapas do pagamento">
      {STEPS.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className={cn('flex items-center gap-2 border-t-2 pt-3 text-sm', active || done ? 'border-primary' : 'border-border text-muted-foreground')}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                active && 'border-primary bg-primary text-primary-foreground',
                done && 'border-primary text-primary',
              )}
              aria-hidden="true"
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className="truncate">
              {step.label}
              <span className="sr-only">{done ? ' (concluída)' : active ? ' (atual)' : ''}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function CheckoutFlow({ user }: { user: User }) {
  const { step: requestedStep } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const cart = useCart()
  const wallets = useWallets(user.id)
  const [collectorDraft, setCollectorDraft] = useState<Partial<Collector>>(
    () => checkoutStorage.readCollector(user.id) ?? { fullName: user.name, email: user.email, displayName: user.name, country: 'Brasil' },
  )
  const [connection, setConnection] = useState<StoredWalletSession | null>(() => checkoutStorage.readWalletSession(user.id))
  const [hasPendingAttempt] = useState(() => checkoutStorage.readAttempt(user.id) !== null)

  const collector = collectorSchema.safeParse(collectorDraft)
  const step: CheckoutStep = hasPendingAttempt && collector.success && connection
    ? 'revisao'
    : !collector.success
      ? 'dados'
      : requestedStep === 'revisao' && !connection
        ? 'carteira'
        : (requestedStep ?? 'dados')

  const goTo = (target: CheckoutStep) => void navigate({ search: { step: target } })

  const updateDraft = (draft: Partial<Collector>) => {
    setCollectorDraft(draft)
    checkoutStorage.writeCollector(user.id, draft)
  }

  const updateConnection = (next: StoredWalletSession | null) => {
    setConnection(next)
    if (next) checkoutStorage.writeWalletSession(user.id, next)
    else checkoutStorage.clearWalletSession(user.id)
  }

  const onPlaced = (order: Order) => {
    checkoutStorage.clearWalletSession(user.id)
    void navigate({ to: '/pedidos/$orderId', params: { orderId: order.id }, replace: true })
  }

  if (cart.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Carregando pagamento">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (cart.isError && !cart.data) {
    return <ErrorState error={cart.error} onRetry={() => void cart.refetch()} isRetrying={cart.isRefetching} />
  }

  if (cart.data.items.length === 0 && !hasPendingAttempt) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Não há itens para pagar"
        description="Adicione edições ao carrinho para iniciar o pagamento."
        action={
          <Button asChild>
            <Link to="/">Explorar catálogo</Link>
          </Button>
        }
      />
    )
  }

  const walletLabel = wallets.data?.find((wallet) => wallet.id === connection?.walletId)?.label ?? null

  return (
    <>
      <StepIndicator current={step} />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0">
          {step === 'dados' ? (
            <CollectorStep initial={collectorDraft} onDraftChange={updateDraft} onSubmit={(data) => {
              updateDraft(data)
              goTo('carteira')
            }} />
          ) : null}
          {step === 'carteira' ? (
            <WalletStep
              userId={user.id}
              connection={connection}
              onConnectionChange={updateConnection}
              onBack={() => goTo('dados')}
              onContinue={() => goTo('revisao')}
            />
          ) : null}
          {step === 'revisao' && collector.success && connection ? (
            <ReviewStep
              userId={user.id}
              collector={collector.data}
              connection={connection}
              walletLabel={walletLabel}
              onEditCollector={() => goTo('dados')}
              onEditWallet={() => goTo('carteira')}
              onWalletLost={(message) => {
                updateConnection(null)
                toast.error(message)
                goTo('carteira')
              }}
              onPlaced={onPlaced}
            />
          ) : null}
        </div>
        {step !== 'revisao' ? (
          <aside aria-labelledby="checkout-summary-title" className="grid gap-4 rounded-lg border bg-card p-5">
            <h2 id="checkout-summary-title" className="text-lg font-semibold">
              Resumo do carrinho
            </h2>
            <ul className="grid gap-2 text-sm">
              {cart.data.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {item.quantity} × {item.nftName}
                  </span>
                </li>
              ))}
            </ul>
            <OrderSummaryRows {...cart.data.summary} feeLabel={`Taxa estimada (${NETWORK_LABELS[cart.data.feeNetwork]})`} />
            <p className="text-xs text-muted-foreground">Os valores finais são confirmados na revisão.</p>
          </aside>
        ) : null}
      </div>
    </>
  )
}

export function CheckoutPage() {
  useDocumentTitle('Pagamento')
  const { user } = useSession()
  return (
    <PageContainer>
      <h1 className="mb-6 text-3xl font-bold">Pagamento</h1>
      {user ? <CheckoutFlow key={user.id} user={user} /> : <Skeleton className="h-64 w-full" />}
    </PageContainer>
  )
}
