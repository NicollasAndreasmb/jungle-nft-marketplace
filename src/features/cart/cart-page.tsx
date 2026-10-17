/**
 * Cart screen: line items with bounded quantity editing and removal, per-line status (price
 * changed, insufficient, sold out), coupon apply/remove with API errors, and the server-computed
 * summary. Checkout is blocked while any line is unavailable.
 */
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Info, Loader2, ShoppingBag, Tag, Trash2, X } from 'lucide-react'
import type { Cart, CartItem } from '@/api/contracts'
import { applyCouponRequestSchema } from '@/api/contracts'
import { EthAmount } from '@/components/eth-amount'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { errorMessage } from '@/lib/error-message'
import { Field } from '@/components/form/field'
import { useZodForm } from '@/components/form/use-zod-form'
import { PageContainer } from '@/components/layout/page-container'
import { QuantityStepper } from '@/components/quantity-stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { NETWORK_LABELS } from '@/features/catalog/labels'
import { useDocumentTitle } from '@/lib/use-document-title'
import { toast } from 'sonner'
import { useApplyCoupon, useCart, useRemoveCartItem, useRemoveCoupon, useUpdateCartItem } from './cart-queries'

function LineStatus({ item }: { item: CartItem }) {
  if (item.status === 'sold-out') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-destructive" role="status">
        <AlertTriangle className="size-4" aria-hidden="true" /> Esgotado. Remova o item para continuar.
      </p>
    )
  }
  if (item.status === 'insufficient') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-warning" role="status">
        <AlertTriangle className="size-4" aria-hidden="true" /> Restam {item.available} unidade(s). Ajuste a quantidade.
      </p>
    )
  }
  if (item.status === 'price-changed' && item.previousUnitPriceEth) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-warning" role="status">
        <Info className="size-4" aria-hidden="true" /> Preço atualizado: antes <EthAmount value={item.previousUnitPriceEth} />
      </p>
    )
  }
  return null
}

function CartLine({ item }: { item: CartItem }) {
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()
  const max = Math.max(1, Math.min(item.maxPerOrder, item.available))
  const busy = update.isPending || remove.isPending

  const changeQuantity = (quantity: number) =>
    update.mutate(
      { itemId: item.id, quantity },
      { onError: (error) => toast.error(`Não foi possível alterar a quantidade. ${errorMessage(error)}`) },
    )

  const removeLine = () =>
    remove.mutate(item.id, {
      onSuccess: () => toast.success(`${item.nftName} removido do carrinho.`),
      onError: (error) => toast.error(`Não foi possível remover o item. ${errorMessage(error)}`),
    })

  return (
    <li className="grid grid-cols-[5rem_1fr] gap-4 py-5 sm:grid-cols-[6rem_1fr_auto]" data-testid="cart-line" aria-busy={busy}>
      <img src={item.image.src} alt={item.image.alt} width={96} height={96} loading="lazy" className="aspect-square w-full rounded-md border object-cover" />
      <div className="grid min-w-0 content-start gap-1">
        <Link to="/nft/$nftId" params={{ nftId: item.nftId }} search={{ edition: item.editionId }} className="font-semibold hover:underline">
          {item.nftName}
        </Link>
        <p className="text-sm text-muted-foreground">{item.editionName}</p>
        <p className="text-sm">
          <EthAmount value={item.unitPriceEth} /> <span className="text-muted-foreground">por unidade</span>
        </p>
        <LineStatus item={item} />
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
        <QuantityStepper
          value={item.quantity}
          max={max}
          onChange={changeQuantity}
          disabled={busy || item.status === 'sold-out'}
          label={`Quantidade de ${item.nftName}`}
        />
        <div className="flex items-center gap-2">
          <EthAmount value={item.lineTotalEth} className="font-semibold" />
          <Button variant="ghost" size="icon-sm" onClick={removeLine} disabled={busy} aria-label={`Remover ${item.nftName} (${item.editionName})`}>
            {remove.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </li>
  )
}

function CouponForm({ cart }: { cart: Cart }) {
  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()
  const form = useZodForm(applyCouponRequestSchema, { code: '' })

  if (cart.coupon) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2" data-testid="applied-coupon">
        <span className="flex items-center gap-2 text-sm">
          <Tag className="size-4 text-primary" aria-hidden="true" />
          <span>
            <strong>{cart.coupon.code}</strong> — {cart.coupon.description}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () => toast.success('Cupom removido.'),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <X aria-hidden="true" /> Remover
        </Button>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((data) =>
        apply.mutate(data.code, {
          onSuccess: (updated) => {
            form.setValues({ code: '' })
            toast.success(`Cupom ${updated.coupon?.code ?? data.code} aplicado.`)
          },
          onError: form.applyApiError,
        }),
      )}
      className="grid gap-2"
    >
      <Field name="code" label="Cupom de desconto" error={form.errors.code ?? form.formError ?? undefined}>
        {(props) => (
          <div className="flex gap-2">
            <Input
              {...props}
              value={form.values.code}
              onChange={(event) => form.setValue('code', event.target.value)}
              placeholder="Ex.: JUNGLE10"
              autoComplete="off"
              className="uppercase"
            />
            <Button type="submit" variant="secondary" disabled={apply.isPending}>
              {apply.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Aplicar
            </Button>
          </div>
        )}
      </Field>
    </form>
  )
}

export function OrderSummaryRows({
  subtotalEth,
  discountEth,
  networkFeeEth,
  totalEth,
  feeLabel,
}: {
  subtotalEth: string
  discountEth: string
  networkFeeEth: string
  totalEth: string
  feeLabel: string
}) {
  return (
    <dl className="grid gap-2 text-sm" data-testid="price-summary">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd>
          <EthAmount value={subtotalEth} />
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Desconto</dt>
        <dd>
          {discountEth === '0' ? <EthAmount value="0" /> : <span>− <EthAmount value={discountEth} /></span>}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{feeLabel}</dt>
        <dd>
          <EthAmount value={networkFeeEth} />
        </dd>
      </div>
      <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
        <dt>Total</dt>
        <dd data-testid="summary-total">
          <EthAmount value={totalEth} />
        </dd>
      </div>
    </dl>
  )
}

function CartSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" aria-busy="true" aria-label="Carregando carrinho" data-testid="cart-skeleton">
      <div className="grid gap-5">
        {[0, 1].map((index) => (
          <div key={index} className="grid grid-cols-[6rem_1fr] gap-4">
            <Skeleton className="aspect-square" />
            <div className="grid content-start gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid content-start gap-3 rounded-lg border p-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}

export function CartPage() {
  useDocumentTitle('Carrinho')
  const { data: cart, isPending, isError, error, refetch, isRefetching, isFetching } = useCart()
  const blocked = cart?.items.some((item) => item.status === 'sold-out' || item.status === 'insufficient') ?? false

  return (
    <PageContainer>
      <h1 className="mb-6 text-3xl font-bold">Carrinho</h1>
      {isPending ? (
        <CartSkeleton />
      ) : isError && !cart ? (
        <ErrorState error={error} onRetry={() => void refetch()} isRetrying={isRefetching} title="Não foi possível carregar o carrinho" />
      ) : cart.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Seu carrinho está vazio"
          description="Explore o catálogo e adicione edições para continuar."
          action={
            <Button asChild>
              <Link to="/">Explorar catálogo</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
          <section aria-labelledby="cart-items-title">
            <h2 id="cart-items-title" className="sr-only">
              Itens do carrinho
            </h2>
            <ul className="divide-y border-y">
              {cart.items.map((item) => (
                <CartLine key={item.id} item={item} />
              ))}
            </ul>
          </section>
          <aside aria-labelledby="cart-summary-title" className="grid gap-5 rounded-lg border bg-card p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h2 id="cart-summary-title" className="text-lg font-semibold">
                Resumo
              </h2>
              {isFetching ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Atualizando
                </span>
              ) : null}
            </div>
            <CouponForm cart={cart} />
            <OrderSummaryRows {...cart.summary} feeLabel={`Taxa de rede estimada (${NETWORK_LABELS[cart.feeNetwork]})`} />
            <p className="text-xs text-muted-foreground">A taxa final depende da rede escolhida no pagamento e é confirmada na revisão.</p>
            {blocked ? (
              <p className="text-sm text-warning" role="status">
                Ajuste os itens indisponíveis para continuar.
              </p>
            ) : null}
            {blocked ? (
              <Button size="lg" disabled>
                Ir para o pagamento
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/checkout" data-testid="go-to-checkout">
                  Ir para o pagamento
                </Link>
              </Button>
            )}
          </aside>
        </div>
      )}
    </PageContainer>
  )
}
