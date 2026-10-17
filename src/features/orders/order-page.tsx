/**
 * Order status and receipt. Pending orders update via `order.updated` (with polling fallback and
 * REST reconciliation after reconnects); the receipt is shown only for confirmed orders and is
 * rendered from the order snapshot, never from current catalog data. Rejected orders explain the
 * failure and send the user back to the preserved cart.
 */
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { CheckCircle2, Copy, ExternalLink, FileX, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Order } from '@/api/contracts'
import { ApiError } from '@/api/http'
import { EthAmount } from '@/components/eth-amount'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageContainer } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderSummaryRows } from '@/features/cart/cart-page'
import { NETWORK_LABELS } from '@/features/catalog/labels'
import { useSession } from '@/features/session/session-queries'
import { PROVIDER_LABELS, shortAddress } from '@/features/wallets/wallet-format'
import { useDocumentTitle } from '@/lib/use-document-title'
import { useRealtimeStatus } from '@/realtime/realtime-status'
import { orderQueryOptions } from './order-queries'

const routeApi = getRouteApi('/pedidos/$orderId')

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })

function copy(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copiado.`))
    .catch(() => toast.error('Não foi possível copiar. Selecione o texto manualmente.'))
}

function ExplorerDialog({ order }: { order: Order }) {
  if (!order.transaction) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ExternalLink aria-hidden="true" /> Ver no explorador (simulado)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transação simulada</DialogTitle>
          <DialogDescription>
            Este ambiente não publica transações em blockchain. Os dados abaixo representam o registro simulado do explorador.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Rede</dt>
            <dd>{NETWORK_LABELS[order.network]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bloco</dt>
            <dd className="tabular-nums">{order.transaction.blockNumber.toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Hash</dt>
            <dd className="font-mono text-xs break-all">{order.transaction.hash}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Endereço de referência</dt>
            <dd className="font-mono text-xs break-all">{order.transaction.explorerUrl}</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  )
}

function Receipt({ order }: { order: Order }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="grid gap-6">
        <section aria-labelledby="receipt-items" className="grid gap-3">
          <h2 id="receipt-items" className="text-lg font-semibold">
            Itens comprados
          </h2>
          <ul className="divide-y rounded-lg border" data-testid="receipt-items">
            {order.items.map((item) => (
              <li key={item.editionId} className="flex items-center gap-3 p-3">
                <img src={item.image.src} alt={item.image.alt} width={64} height={64} loading="lazy" className="size-16 rounded-md border object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.nftName}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.editionName} · {item.quantity} × <EthAmount value={item.unitPriceEth} />
                  </p>
                </div>
                <EthAmount value={item.lineTotalEth} className="font-medium" />
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="receipt-details" className="grid gap-3">
          <h2 id="receipt-details" className="text-lg font-semibold">
            Detalhes
          </h2>
          <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Pedido</dt>
              <dd className="font-mono text-xs">{order.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Data</dt>
              <dd>{dateFormatter.format(new Date(order.createdAt))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Carteira</dt>
              <dd>
                {order.wallet.label} · {PROVIDER_LABELS[order.wallet.provider]} · <span className="font-mono">{shortAddress(order.wallet.address)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rede</dt>
              <dd>{NETWORK_LABELS[order.network]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Colecionador</dt>
              <dd>
                {order.collector.fullName} ({order.collector.email})
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Certificado em nome de</dt>
              <dd>{order.collector.displayName}</dd>
            </div>
            {order.transaction ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Transação (simulada)</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs break-all" data-testid="transaction-hash">
                    {order.transaction.hash}
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={() => copy(order.transaction?.hash ?? '', 'Hash da transação')} aria-label="Copiar hash da transação">
                    <Copy aria-hidden="true" />
                  </Button>
                </dd>
              </div>
            ) : null}
          </dl>
          <div>
            <ExplorerDialog order={order} />
          </div>
        </section>
      </div>
      <aside aria-labelledby="receipt-summary" className="grid gap-4 rounded-lg border bg-card p-5">
        <h2 id="receipt-summary" className="text-lg font-semibold">
          Valores
        </h2>
        {order.couponCode ? <p className="text-sm text-muted-foreground">Cupom: {order.couponCode}</p> : null}
        <OrderSummaryRows {...order} feeLabel={`Taxa de rede (${NETWORK_LABELS[order.network]})`} />
        <Button asChild variant="outline">
          <Link to="/">Continuar explorando</Link>
        </Button>
      </aside>
    </div>
  )
}

function OrderView({ userId, orderId }: { userId: string; orderId: string }) {
  const { data: order, isPending, isError, error, refetch, isRefetching } = useQuery(orderQueryOptions(userId, orderId))
  const realtime = useRealtimeStatus()
  useDocumentTitle(order?.status === 'confirmed' ? 'Pedido confirmado' : order?.status === 'rejected' ? 'Pagamento recusado' : 'Pedido')

  if (isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Carregando pedido">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <>
        <h1 className="mb-6 text-3xl font-bold">Pedido não encontrado</h1>
        <EmptyState
          icon={FileX}
          title="Não encontramos este pedido na sua conta"
          action={
            <Button asChild>
              <Link to="/">Voltar ao catálogo</Link>
            </Button>
          }
        />
      </>
    )
  }

  if (isError || !order) {
    return (
      <>
        <h1 className="mb-6 text-3xl font-bold">Pedido</h1>
        <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} title="Não foi possível carregar o pedido" />
      </>
    )
  }

  if (order.status === 'pending') {
    return (
      <div className="grid max-w-2xl gap-6">
        <h1 className="text-3xl font-bold">Aguardando confirmação</h1>
        <div role="status" className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-5" data-testid="order-status" data-status="pending">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-warning" aria-hidden="true" />
          <div className="grid gap-1">
            <p className="font-medium">Pagamento em processamento na carteira {order.wallet.label}.</p>
            <p className="text-sm text-muted-foreground">
              Você pode recarregar ou fechar esta página com segurança: o pedido continua o mesmo e o status é atualizado automaticamente.
            </p>
            {realtime !== 'connected' ? (
              <p className="text-sm text-muted-foreground">Conexão em tempo real interrompida. Verificando o status periodicamente…</p>
            ) : null}
          </div>
        </div>
        <OrderSummaryRows {...order} feeLabel={`Taxa de rede (${NETWORK_LABELS[order.network]})`} />
      </div>
    )
  }

  if (order.status === 'rejected') {
    return (
      <div className="grid max-w-2xl gap-6">
        <h1 className="text-3xl font-bold">Pagamento recusado</h1>
        <div role="status" className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-5" data-testid="order-status" data-status="rejected">
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="grid gap-1">
            <p className="font-medium">{order.failureReason ?? 'O pagamento não foi concluído.'}</p>
            <p className="text-sm text-muted-foreground">Os itens continuam no seu carrinho. Você pode tentar novamente com outra carteira ou rede.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/carrinho">Voltar ao carrinho</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div role="status" className="flex items-start gap-3" data-testid="order-status" data-status="confirmed">
        <CheckCircle2 className="mt-1 size-7 shrink-0 text-success" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-bold">Compra confirmada</h1>
          <p className="text-muted-foreground">O recibo abaixo reproduz os valores registrados no momento da compra.</p>
        </div>
      </div>
      <Receipt order={order} />
    </div>
  )
}

export function OrderPage() {
  const { orderId } = routeApi.useParams()
  const { user } = useSession()
  return <PageContainer>{user ? <OrderView key={`${user.id}-${orderId}`} userId={user.id} orderId={orderId} /> : <Skeleton className="h-40 w-full" />}</PageContainer>
}
