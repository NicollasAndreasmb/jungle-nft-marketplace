/**
 * Checkout step 2: choose one of the collector's registered wallets and a supported network, then
 * simulate the wallet connection (approve, reject, disconnect) through the API.
 */
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, Loader2, Unplug, Wallet as WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { checkoutApi } from '@/api/checkout'
import type { Network, Wallet } from '@/api/contracts'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { errorMessage } from '@/lib/error-message'
import { FormError } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { NETWORK_LABELS } from '@/features/catalog/labels'
import { PROVIDER_LABELS, shortAddress } from '@/features/wallets/wallet-format'
import { useWallets } from '@/features/wallets/wallet-queries'
import { cn } from '@/lib/utils'
import type { StoredWalletSession } from './checkout-storage'

export function WalletStep({
  userId,
  connection,
  onConnectionChange,
  onContinue,
  onBack,
}: {
  userId: string
  connection: StoredWalletSession | null
  onConnectionChange: (connection: StoredWalletSession | null) => void
  onContinue: () => void
  onBack: () => void
}) {
  const wallets = useWallets(userId)
  const [walletId, setWalletId] = useState<string | null>(connection?.walletId ?? null)
  const [network, setNetwork] = useState<Network | null>(connection?.network ?? null)
  const [error, setError] = useState<string | null>(null)

  const list = wallets.data ?? []
  const selectedWallet: Wallet | undefined = list.find((wallet) => wallet.id === walletId) ?? list[0]
  const selectedNetwork: Network | undefined =
    network && selectedWallet?.networks.includes(network) ? network : selectedWallet?.networks[0]
  const connected = connection && connection.walletId === selectedWallet?.id && connection.network === selectedNetwork ? connection : null

  const disconnect = useMutation({
    mutationFn: (sessionId: string) => checkoutApi.disconnectWallet(sessionId),
    onSettled: () => onConnectionChange(null),
  })

  const connect = useMutation({
    mutationFn: ({ wallet, chosen }: { wallet: Wallet; chosen: Network }) => checkoutApi.connectWallet(wallet.id, chosen),
    onSuccess: (session) => {
      setError(null)
      onConnectionChange({ sessionId: session.id, walletId: session.walletId, network: session.network })
    },
    onError: (failure) => setError(errorMessage(failure, 'Não foi possível conectar a carteira.')),
  })

  const resetConnection = () => {
    if (connection) disconnect.mutate(connection.sessionId)
    setError(null)
  }

  if (wallets.isPending) {
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Carregando carteiras">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (wallets.isError) {
    return <ErrorState error={wallets.error} onRetry={() => void wallets.refetch()} isRetrying={wallets.isRefetching} title="Não foi possível carregar suas carteiras" />
  }

  if (!selectedWallet || !selectedNetwork) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="Cadastre uma carteira para pagar"
        description="Você precisa de uma carteira principal ou secundária cadastrada para concluir a compra."
        action={
          <Button asChild>
            <Link to="/carteiras">Cadastrar carteira</Link>
          </Button>
        }
      />
    )
  }

  return (
    <section className="grid gap-5" aria-labelledby="wallet-title">
      <h2 id="wallet-title" className="text-xl font-semibold">
        Carteira e rede
      </h2>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Carteira</legend>
        <RadioGroup
          value={selectedWallet.id}
          onValueChange={(value) => {
            resetConnection()
            setWalletId(value)
          }}
          className="grid gap-2"
        >
          {list.map((wallet) => (
            <Label
              key={wallet.id}
              htmlFor={`wallet-${wallet.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-md border p-3 font-normal has-[:checked]:border-primary"
            >
              <RadioGroupItem id={`wallet-${wallet.id}`} value={wallet.id} />
              <span className="grid flex-1 gap-0.5">
                <span className="font-medium">
                  {wallet.label} <span className="text-xs text-muted-foreground">({wallet.slot === 'primary' ? 'principal' : 'secundária'})</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {PROVIDER_LABELS[wallet.provider]} · <span className="font-mono">{shortAddress(wallet.address)}</span>
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="checkout-network" className="text-sm font-semibold">
          Rede
        </Label>
        <Select
          value={selectedNetwork}
          onValueChange={(value) => {
            resetConnection()
            setNetwork(value as Network)
          }}
        >
          <SelectTrigger id="checkout-network" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectedWallet.networks.map((option) => (
              <SelectItem key={option} value={option}>
                {NETWORK_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className={cn('flex flex-wrap items-center gap-3 rounded-md border p-4', connected ? 'border-success/50 bg-success/5' : '')}
        role="status"
        data-testid="wallet-connection"
      >
        {connected ? (
          <>
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            <span className="flex-1 text-sm">
              Conectada: <strong>{selectedWallet.label}</strong> na rede {NETWORK_LABELS[selectedNetwork]}.
            </span>
            <Button variant="ghost" size="sm" onClick={resetConnection} disabled={disconnect.isPending}>
              <Unplug aria-hidden="true" /> Desconectar
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-muted-foreground">Carteira desconectada. Conecte para autorizar o pagamento.</span>
            <Button
              variant="secondary"
              onClick={() => connect.mutate({ wallet: selectedWallet, chosen: selectedNetwork })}
              disabled={connect.isPending}
              data-testid="connect-wallet"
            >
              {connect.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <WalletIcon aria-hidden="true" />}
              {connect.isPending ? 'Aguardando a carteira…' : 'Conectar carteira'}
            </Button>
          </>
        )}
      </div>
      <FormError message={error} />

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="lg" onClick={onBack}>
          Voltar
        </Button>
        <Button size="lg" onClick={onContinue} disabled={!connected}>
          Revisar pedido
        </Button>
      </div>
    </section>
  )
}
