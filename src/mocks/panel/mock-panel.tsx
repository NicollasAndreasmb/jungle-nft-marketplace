/**
 * Demo control panel for the mock backend (only bundled when mocks are enabled).
 * Selects and resets deterministic scenarios and triggers server-side changes; every action goes
 * through the mock server, so the app only learns about them via REST and Socket.IO.
 */
import { FlaskConical, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { addEth, percentOfEth } from '@/lib/eth'
import { mockControl } from '../control'
import { db } from '../db'

export default function MockPanel() {
  const [open, setOpen] = useState(false)
  const [scenarioId, setScenarioId] = useState(() => mockControl.getScenario().id)
  const nfts = open ? db().nfts : []
  const [nftId, setNftId] = useState('nft-001')
  const nft = nfts.find((candidate) => candidate.id === nftId)
  const [editionId, setEditionId] = useState<string | null>(null)
  const edition = nft?.editions.find((candidate) => candidate.id === editionId) ?? nft?.editions[0]

  const applyScenario = () => {
    mockControl.setScenario(scenarioId)
    window.location.reload()
  }

  const run = (label: string, action: () => unknown) => {
    try {
      action()
      toast.info(`Mock: ${label}`)
    } catch (error) {
      toast.error(`Mock: falha ao executar (${error instanceof Error ? error.message : 'erro'})`)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="border-t bg-muted/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <span>Backend simulado (MSW) · cenário: {mockControl.scenarios.find((scenario) => scenario.id === mockControl.getScenario().id)?.label}</span>
          <SheetTrigger asChild>
            <Button variant="secondary" size="sm" data-testid="mock-panel-trigger">
              <FlaskConical aria-hidden="true" /> Cenários
            </Button>
          </SheetTrigger>
        </div>
      </div>
      <SheetContent side="left" className="w-[min(24rem,100vw)] overflow-y-auto">
        <SheetHeader className="px-0">
          <SheetTitle>Cenários de simulação</SheetTitle>
          <SheetDescription>Controla o backend simulado (MSW). As mudanças chegam à aplicação por REST e Socket.IO.</SheetDescription>
        </SheetHeader>

        <section className="grid gap-3 border-b pb-5" aria-labelledby="mock-scenario-title">
          <h3 id="mock-scenario-title" className="text-sm font-semibold">
            Cenário de rede e negócio
          </h3>
          <Label htmlFor="mock-scenario" className="sr-only">
            Cenário
          </Label>
          <Select value={scenarioId} onValueChange={setScenarioId}>
            <SelectTrigger id="mock-scenario" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mockControl.scenarios.map((scenario) => (
                <SelectItem key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{mockControl.scenarios.find((scenario) => scenario.id === scenarioId)?.description}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={applyScenario}>
              Aplicar e recarregar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void mockControl.reset()}>
              <RotateCcw aria-hidden="true" /> Restaurar dados
            </Button>
          </div>
        </section>

        <section className="grid gap-3 border-b py-5" aria-labelledby="mock-realtime-title">
          <h3 id="mock-realtime-title" className="text-sm font-semibold">
            Catálogo em tempo real
          </h3>
          <Label htmlFor="mock-nft">NFT</Label>
          <Select value={nftId} onValueChange={(value) => { setNftId(value); setEditionId(null) }}>
            <SelectTrigger id="mock-nft" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nfts.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="mock-edition">Edição</Label>
          <Select value={edition?.id ?? ''} onValueChange={setEditionId}>
            <SelectTrigger id="mock-edition" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nft?.editions.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name} — {candidate.priceEth} ETH · {candidate.available} disp.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!edition}
              onClick={() =>
                edition &&
                run('preço aumentado em 15%', () => mockControl.updateEdition(nftId, edition.id, { priceEth: addEth(edition.priceEth, percentOfEth(edition.priceEth, 15)) }))
              }
            >
              Aumentar preço 15%
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!edition}
              onClick={() => edition && run('edição esgotada', () => mockControl.updateEdition(nftId, edition.id, { available: 0 }))}
            >
              Esgotar edição
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!edition}
              onClick={() => edition && run('estoque reposto', () => mockControl.updateEdition(nftId, edition.id, { available: edition.supply }))}
            >
              Repor estoque
            </Button>
          </div>
        </section>

        <section className="grid gap-3 py-5" aria-labelledby="mock-connection-title">
          <h3 id="mock-connection-title" className="text-sm font-semibold">
            Conexão, eventos e sessão
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                run('tempo real indisponível por 10 s', () => {
                  mockControl.setRealtimeOffline(true)
                  window.setTimeout(() => mockControl.setRealtimeOffline(false), 10_000)
                })
              }
            >
              Derrubar tempo real (10 s)
            </Button>
            <Button size="sm" variant="outline" onClick={() => run('último evento reenviado', () => mockControl.replayLastEvent())}>
              Reenviar evento (duplicado)
            </Button>
            <Button size="sm" variant="outline" onClick={() => run('evento antigo reenviado', () => mockControl.replayStaleNftEvent(nftId))}>
              Reenviar evento antigo
            </Button>
            <Button size="sm" variant="outline" onClick={() => run('sessões expiradas', () => mockControl.expireSession())}>
              Expirar sessão
            </Button>
            <Button size="sm" variant="outline" onClick={() => run('pedidos pendentes resolvidos', () => mockControl.resolvePendingOrders())}>
              Resolver pedidos pendentes
            </Button>
          </div>
        </section>
      </SheetContent>
    </Sheet>
  )
}
