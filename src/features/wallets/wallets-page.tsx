/**
 * Wallet management: create and edit the primary and secondary wallets (label, address,
 * provider, enabled networks) with schema validation and API conflict errors.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { accountApi } from '@/api/account'
import {
  NETWORKS,
  type Network,
  type Wallet,
  type WalletProvider,
  type WalletSlot,
  walletInputSchema,
  walletProviderSchema,
} from '@/api/contracts'
import { queryKeys } from '@/api/query-keys'
import { ErrorState } from '@/components/feedback/states'
import { Field, FormError } from '@/components/form/field'
import { useZodForm } from '@/components/form/use-zod-form'
import { PageContainer } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { NETWORK_LABELS } from '@/features/catalog/labels'
import { useWallets } from './wallet-queries'
import { useSession } from '@/features/session/session-queries'
import { useDocumentTitle } from '@/lib/use-document-title'
import { PROVIDER_LABELS } from './wallet-format'

const SLOT_LABELS: Record<WalletSlot, string> = { primary: 'Carteira principal', secondary: 'Carteira secundária' }

function WalletForm({
  userId,
  slot,
  wallet,
  onDone,
}: {
  userId: string
  slot: WalletSlot
  wallet: Wallet | undefined
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const form = useZodForm(walletInputSchema, {
    label: wallet?.label ?? '',
    address: wallet?.address ?? '',
    provider: wallet?.provider ?? 'metamask',
    networks: wallet?.networks ?? ['ethereum'],
  })
  const save = useMutation({
    mutationFn: (input: z.output<typeof walletInputSchema>) =>
      wallet ? accountApi.updateWallet(wallet.id, input) : accountApi.createWallet({ ...input, slot }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.wallets(userId) })
      toast.success(wallet ? 'Carteira atualizada.' : 'Carteira cadastrada.')
      onDone()
    },
    onError: form.applyApiError,
  })

  const prefix = `${slot}`
  const toggleNetwork = (network: Network, checked: boolean) => {
    const next = checked ? [...form.values.networks, network] : form.values.networks.filter((value) => value !== network)
    form.setValue('networks', NETWORKS.filter((value) => next.includes(value)))
  }

  return (
    <form noValidate onSubmit={form.handleSubmit((data) => save.mutate(data))} className="grid gap-4" aria-label={`Formulário da ${SLOT_LABELS[slot].toLowerCase()}`}>
      <FormError message={form.formError} />
      <Field name={`${prefix}-label`} label="Apelido" error={form.errors.label}>
        {(props) => <Input {...props} value={form.values.label} onChange={(event) => form.setValue('label', event.target.value)} />}
      </Field>
      <Field name={`${prefix}-address`} label="Endereço" hint="Formato 0x seguido de 40 caracteres hexadecimais." error={form.errors.address}>
        {(props) => (
          <Input
            {...props}
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
            value={form.values.address}
            onChange={(event) => form.setValue('address', event.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-provider`}>Provedor</Label>
        <Select value={form.values.provider} onValueChange={(value) => form.setValue('provider', value as WalletProvider)}>
          <SelectTrigger id={`${prefix}-provider`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {walletProviderSchema.options.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {PROVIDER_LABELS[provider]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="grid gap-2" aria-describedby={form.errors.networks ? `${prefix}-networks-error` : undefined}>
        <legend className="mb-1 text-sm font-medium">Redes habilitadas</legend>
        <div className="flex flex-wrap gap-4">
          {NETWORKS.map((network) => {
            const id = `${prefix}-network-${network}`
            return (
              <div key={network} className="flex items-center gap-2">
                <Checkbox id={id} checked={form.values.networks.includes(network)} onCheckedChange={(checked) => toggleNetwork(network, checked === true)} />
                <Label htmlFor={id} className="font-normal">
                  {NETWORK_LABELS[network]}
                </Label>
              </div>
            )
          })}
        </div>
        {form.errors.networks ? (
          <p id={`${prefix}-networks-error`} role="alert" className="text-sm text-destructive">
            {form.errors.networks}
          </p>
        ) : null}
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {wallet ? 'Salvar carteira' : 'Cadastrar carteira'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={save.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function WalletSlotSection({ userId, slot, wallet }: { userId: string; slot: WalletSlot; wallet: Wallet | undefined }) {
  const [editing, setEditing] = useState(false)
  const titleId = `wallet-slot-${slot}`
  return (
    <section aria-labelledby={titleId} className="grid content-start gap-4 rounded-lg border bg-card p-5" data-testid={`wallet-slot-${slot}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {SLOT_LABELS[slot]}
        </h2>
        {wallet && !editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Editar
          </Button>
        ) : null}
      </div>
      {editing ? (
        <WalletForm userId={userId} slot={slot} wallet={wallet} onDone={() => setEditing(false)} />
      ) : wallet ? (
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Apelido</dt>
            <dd>{wallet.label}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Endereço</dt>
            <dd className="font-mono text-xs break-all">{wallet.address}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Provedor</dt>
            <dd>{PROVIDER_LABELS[wallet.provider]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Redes</dt>
            <dd>{wallet.networks.map((network) => NETWORK_LABELS[network]).join(', ')}</dd>
          </div>
        </dl>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">Nenhuma carteira cadastrada nesta posição.</p>
          <Button variant="secondary" className="justify-self-start" onClick={() => setEditing(true)}>
            <Plus aria-hidden="true" /> Cadastrar {SLOT_LABELS[slot].toLowerCase()}
          </Button>
        </div>
      )}
    </section>
  )
}

export function WalletsPage() {
  useDocumentTitle('Carteiras')
  const { user } = useSession()
  const wallets = useWallets(user?.id ?? 'anonymous')
  return (
    <PageContainer>
      <h1 className="mb-2 text-3xl font-bold">Carteiras</h1>
      <p className="mb-6 text-muted-foreground">Cadastre até duas carteiras para usar no pagamento. A conexão é simulada neste ambiente.</p>
      {!user || wallets.isPending ? (
        <div className="grid gap-6 md:grid-cols-2" aria-busy="true" aria-label="Carregando carteiras">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : wallets.isError ? (
        <ErrorState error={wallets.error} onRetry={() => void wallets.refetch()} isRetrying={wallets.isRefetching} title="Não foi possível carregar as carteiras" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {(['primary', 'secondary'] as const).map((slot) => (
            <WalletSlotSection key={slot} userId={user.id} slot={slot} wallet={wallets.data.find((wallet) => wallet.slot === slot)} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}
