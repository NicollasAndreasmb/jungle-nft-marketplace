/**
 * Checkout step 3: binding quote review and confirmation.
 *
 * Requests a quote for the chosen network, shows items, coupon, fee and total from the API and
 * blocks confirmation while the quote is stale (realtime price/availability change or 409
 * QUOTE_STALE) or expired, requiring the user to refresh the review and confirm again.
 * Resumes an unfinished attempt (same idempotency key) after refresh or re-authentication.
 */
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { checkoutApi } from '@/api/checkout'
import {
  type Collector,
  type Order,
  type Quote,
  type QuoteChange,
  quoteChangeListSchema,
} from '@/api/contracts'
import { ApiError } from '@/api/http'
import { EthAmount } from '@/components/eth-amount'
import { errorMessage } from '@/lib/error-message'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderSummaryRows } from '@/features/cart/cart-page'
import { NETWORK_LABELS } from '@/features/catalog/labels'
import { compareEth } from '@/lib/eth'
import { realtimeBus } from '@/realtime/realtime-bus'
import { type CheckoutAttempt, type StoredWalletSession, checkoutStorage, createIdempotencyKey } from './checkout-storage'
import { QuoteChanges } from './quote-changes'
import { usePlaceOrder } from './use-place-order'

function parseChanges(error: unknown): QuoteChange[] {
  if (!(error instanceof ApiError)) return []
  const parsed = quoteChangeListSchema.safeParse(error.details)
  return parsed.success ? parsed.data : []
}

function mergeChanges(current: QuoteChange[], incoming: QuoteChange[]): QuoteChange[] {
  const byKey = new Map(current.map((change) => [`${change.editionId}-${change.kind}`, change]))
  incoming.forEach((change) => byKey.set(`${change.editionId}-${change.kind}`, change))
  return [...byKey.values()]
}

export function ReviewStep({
  userId,
  collector,
  connection,
  walletLabel,
  onEditCollector,
  onEditWallet,
  onWalletLost,
  onPlaced,
}: {
  userId: string
  collector: Collector
  connection: StoredWalletSession
  walletLabel: string | null
  onEditCollector: () => void
  onEditWallet: () => void
  onWalletLost: (message: string) => void
  onPlaced: (order: Order) => void
}) {
  const [resumableAttempt] = useState<CheckoutAttempt | null>(() => checkoutStorage.readAttempt(userId))
  const [quote, setQuote] = useState<Quote | null>(resumableAttempt?.quote ?? null)
  const [changes, setChanges] = useState<QuoteChange[]>([])
  const [blocked, setBlocked] = useState<QuoteChange[]>([])
  const [expired, setExpired] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const started = useRef(false)

  const createQuote = useMutation({
    mutationFn: () => checkoutApi.createQuote(connection.network),
    onSuccess: (next) => {
      setQuote(next)
      setChanges([])
      setBlocked([])
      setExpired(false)
      setSubmitError(null)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'AVAILABILITY_CONFLICT') setBlocked(parseChanges(error))
    },
  })

  const order = usePlaceOrder(userId, onPlaced)

  const handlePlaceError = (error: unknown) => {
    if (!(error instanceof ApiError)) {
      setSubmitError('Não foi possível enviar o pedido. Tente novamente.')
      return
    }
    switch (error.code) {
      case 'QUOTE_STALE':
        setChanges((current) => mergeChanges(current, parseChanges(error)))
        setSubmitError(null)
        return
      case 'QUOTE_EXPIRED':
      case 'QUOTE_NOT_FOUND':
        setExpired(true)
        setSubmitError(error.message)
        return
      case 'WALLET_NOT_CONNECTED':
      case 'NETWORK_MISMATCH':
        onWalletLost(error.message)
        return
      default:
        setSubmitError(
          error.kind === 'timeout' || error.kind === 'network'
            ? 'Não recebemos a confirmação do envio. Tente novamente: a mesma tentativa será reaproveitada, sem duplicar a compra.'
            : error.message,
        )
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const attempt = resumableAttempt
    if (attempt && attempt.body.walletSessionId === connection.sessionId) {
      order.place(attempt, { onError: handlePlaceError })
    } else {
      if (attempt) checkoutStorage.clearAttempt(userId)
      createQuote.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mounted review; the ref guard prevents duplicate quotes in StrictMode
  }, [])

  useEffect(() => {
    if (!quote) return
    const remaining = new Date(quote.expiresAt).getTime() - Date.now()
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, remaining))
    return () => window.clearTimeout(timer)
  }, [quote])

  useEffect(() => {
    if (!quote) return
    return realtimeBus.nftUpdated.subscribe((event) => {
      const detected: QuoteChange[] = quote.items.flatMap((line): QuoteChange[] => {
        if (line.nftId !== event.resource.id) return []
        const edition = event.data.editions.find((candidate) => candidate.id === line.editionId)
        if (!edition) return []
        const base = { nftId: line.nftId, editionId: line.editionId, nftName: line.nftName, editionName: line.editionName }
        if (edition.available === 0) return [{ ...base, kind: 'sold-out', previousUnitPriceEth: line.unitPriceEth, currentUnitPriceEth: edition.priceEth, available: 0 }]
        if (edition.available < line.quantity) {
          return [{ ...base, kind: 'insufficient', previousUnitPriceEth: line.unitPriceEth, currentUnitPriceEth: edition.priceEth, available: edition.available }]
        }
        if (compareEth(edition.priceEth, line.unitPriceEth) !== 0) {
          return [{ ...base, kind: 'price-changed', previousUnitPriceEth: line.unitPriceEth, currentUnitPriceEth: edition.priceEth, available: edition.available }]
        }
        return []
      })
      if (detected.length) setChanges((current) => mergeChanges(current, detected))
    })
  }, [quote])

  const confirm = () => {
    if (!quote) return
    setSubmitError(null)
    order.place(
      {
        idempotencyKey: createIdempotencyKey(),
        body: { quoteId: quote.id, walletSessionId: connection.sessionId, collector },
        quote,
      },
      { onError: handlePlaceError },
    )
  }

  const retrySameAttempt = () => {
    const attempt = checkoutStorage.readAttempt(userId)
    setSubmitError(null)
    if (attempt) order.place(attempt, { onError: handlePlaceError })
    else confirm()
  }

  const stale = changes.length > 0
  const canConfirm = Boolean(quote) && !stale && !expired && !order.isPending && !createQuote.isPending
  const transportFailed = submitError !== null && checkoutStorage.readAttempt(userId) !== null

  return (
    <section className="grid gap-6" aria-labelledby="review-title">
      <h2 id="review-title" className="text-xl font-semibold">
        Revisão do pedido
      </h2>

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="flex items-center justify-between text-muted-foreground">
            Colecionador
            <Button variant="link" size="xs" onClick={onEditCollector} disabled={order.isPending}>
              Editar
            </Button>
          </dt>
          <dd>
            {collector.fullName} · {collector.email}
            <br />
            Certificado: {collector.displayName} · {collector.country}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="flex items-center justify-between text-muted-foreground">
            Carteira e rede
            <Button variant="link" size="xs" onClick={onEditWallet} disabled={order.isPending}>
              Alterar
            </Button>
          </dt>
          <dd>
            {walletLabel ?? 'Carteira conectada'} · {NETWORK_LABELS[connection.network]}
          </dd>
        </div>
      </dl>

      {blocked.length > 0 ? (
        <div role="alert" className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-5 text-destructive" aria-hidden="true" /> Alguns itens não estão disponíveis
          </p>
          <QuoteChanges changes={blocked} />
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <Link to="/carrinho">Ajustar carrinho</Link>
          </Button>
        </div>
      ) : null}

      {createQuote.isError && blocked.length === 0 ? (
        <div role="alert" className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p>{errorMessage(createQuote.error)}</p>
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => createQuote.mutate()}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {stale || expired ? (
        <div role="alert" className="grid gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4" data-testid="stale-quote">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-5 text-warning" aria-hidden="true" />
            {stale ? 'Os valores do pedido mudaram. Revise e confirme novamente.' : 'A cotação expirou. Atualize a revisão para continuar.'}
          </p>
          <QuoteChanges changes={changes} />
          <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => createQuote.mutate()} disabled={createQuote.isPending}>
            <RefreshCw className={createQuote.isPending ? 'animate-spin' : undefined} aria-hidden="true" />
            Atualizar revisão
          </Button>
        </div>
      ) : null}

      {!quote ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Gerando cotação" data-testid="quote-skeleton">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <div className="grid gap-5">
          <ul className="divide-y rounded-lg border">
            {quote.items.map((item) => (
              <li key={item.editionId} className="flex items-center gap-3 p-3">
                <img src={item.image.src} alt="" width={56} height={56} loading="lazy" className="size-14 rounded-md border object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.nftName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.editionName} · {item.quantity} × <EthAmount value={item.unitPriceEth} />
                  </p>
                </div>
                <EthAmount value={item.lineTotalEth} className="font-medium" />
              </li>
            ))}
          </ul>
          {quote.couponCode ? <p className="text-sm text-muted-foreground">Cupom aplicado: {quote.couponCode}</p> : null}
          <OrderSummaryRows {...quote} feeLabel={`Taxa de rede (${NETWORK_LABELS[quote.network]})`} />
          <p className="text-xs text-muted-foreground">
            Cotação válida até {new Date(quote.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. O pagamento é
            autorizado pela carteira conectada após a confirmação.
          </p>
        </div>
      )}

      {order.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm" data-testid="order-submitting">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {order.retryCount > 0
            ? `A resposta demorou. Verificando o pedido com a mesma tentativa (${order.retryCount}/2)…`
            : resumableAttempt
              ? 'Retomando a sua última tentativa de compra…'
              : 'Enviando pedido…'}
        </p>
      ) : null}

      {submitError ? (
        <div role="alert" className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p>{submitError}</p>
          {transportFailed ? (
            <Button variant="outline" size="sm" className="justify-self-start" onClick={retrySameAttempt}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="lg" onClick={onEditWallet} disabled={order.isPending}>
          Voltar
        </Button>
        <Button size="lg" onClick={confirm} disabled={!canConfirm} data-testid="confirm-order">
          {order.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {quote ? (
            <>
              Confirmar compra · <EthAmount value={quote.totalEth} />
            </>
          ) : (
            'Confirmar compra'
          )}
        </Button>
      </div>
    </section>
  )
}
