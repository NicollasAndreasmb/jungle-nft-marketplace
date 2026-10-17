/**
 * Network condition and failure scenarios for the mock server.
 *
 * A scenario is a named, deterministic preset (latency model + fault rules + business switches).
 * The active scenario is persisted in localStorage and can be selected with the `?mock-scenario=`
 * URL parameter, the mock panel or `window.__jungleMock`. Ad-hoc fault rules can be added on top
 * for tests (e.g. "fail the next 2 PUT /favorites/* with 503").
 */

export type FaultKind = 'network' | 'timeout' | number

export interface FaultRule {
  method: string
  path: string
  fault: FaultKind
  times: number
}

export interface ScenarioDefinition {
  id: string
  label: string
  description: string
  latency: 'default' | 'slow' | 'variable' | 'none'
  faults?: Array<Omit<FaultRule, 'times'> & { times?: number }>
  flags?: Partial<ScenarioFlags>
}

export interface ScenarioFlags {
  emptyCatalog: boolean
  paymentDeclined: boolean
  orderTimeout: boolean
  priceChangeOnCheckout: boolean
  soldOutOnCheckout: boolean
  walletRejects: boolean
}

export const SCENARIOS: ScenarioDefinition[] = [
  { id: 'default', label: 'Padrão', description: 'Sucesso com latência curta e estável.', latency: 'default' },
  { id: 'empty-catalog', label: 'Catálogo vazio', description: 'Listagem e destaques sem resultados.', latency: 'default', flags: { emptyCatalog: true } },
  { id: 'slow', label: 'Rede lenta', description: 'Todas as respostas levam cerca de 2,5 s.', latency: 'slow' },
  {
    id: 'variable-latency',
    label: 'Latência variável',
    description: 'Latência determinística por URL (0,2–2 s): respostas chegam fora de ordem.',
    latency: 'variable',
  },
  {
    id: 'offline',
    label: 'Sem conexão',
    description: 'Todas as requisições REST falham por indisponibilidade de rede.',
    latency: 'none',
    faults: [{ method: '*', path: '*', fault: 'network', times: Number.POSITIVE_INFINITY }],
  },
  {
    id: 'server-error',
    label: 'Erro 500 no catálogo',
    description: 'Listagem, destaques e detalhe respondem HTTP 500.',
    latency: 'default',
    faults: [
      { method: 'GET', path: '/api/nfts', fault: 500, times: Number.POSITIVE_INFINITY },
      { method: 'GET', path: '/api/nfts/*', fault: 500, times: Number.POSITIVE_INFINITY },
    ],
  },
  {
    id: 'flaky',
    label: 'Falha transitória',
    description: 'A primeira requisição do catálogo responde 503; a nova tentativa funciona.',
    latency: 'default',
    faults: [{ method: 'GET', path: '/api/nfts', fault: 503, times: 1 }],
  },
  {
    id: 'favorite-failure',
    label: 'Falha em favoritos',
    description: 'Incluir e remover favoritos respondem HTTP 503.',
    latency: 'default',
    faults: [
      { method: 'PUT', path: '/api/favorites/*', fault: 503, times: Number.POSITIVE_INFINITY },
      { method: 'DELETE', path: '/api/favorites/*', fault: 503, times: Number.POSITIVE_INFINITY },
    ],
  },
  {
    id: 'unauthorized',
    label: 'Acesso negado',
    description: 'Perfil e carteiras respondem HTTP 403.',
    latency: 'default',
    faults: [
      { method: 'GET', path: '/api/profile', fault: 403, times: Number.POSITIVE_INFINITY },
      { method: 'GET', path: '/api/wallets', fault: 403, times: Number.POSITIVE_INFINITY },
    ],
  },
  { id: 'price-change', label: 'Preço alterado na compra', description: 'O preço do primeiro item sobe ao enviar o pedido.', latency: 'default', flags: { priceChangeOnCheckout: true } },
  { id: 'sold-out', label: 'Edição esgotada na compra', description: 'A edição do primeiro item esgota ao enviar o pedido.', latency: 'default', flags: { soldOutOnCheckout: true } },
  { id: 'order-timeout', label: 'Timeout do pedido', description: 'O pedido é criado, mas a resposta excede o timeout do cliente.', latency: 'default', flags: { orderTimeout: true } },
  { id: 'payment-declined', label: 'Pagamento recusado', description: 'A carteira recusa o pagamento após o envio.', latency: 'default', flags: { paymentDeclined: true } },
  { id: 'wallet-rejects', label: 'Carteira recusa conexão', description: 'A solicitação de conexão da carteira é recusada.', latency: 'default', flags: { walletRejects: true } },
]

const STORAGE_KEY = 'jungle-mock-scenario'
const DEFAULT_FLAGS: ScenarioFlags = {
  emptyCatalog: false,
  paymentDeclined: false,
  orderTimeout: false,
  priceChangeOnCheckout: false,
  soldOutOnCheckout: false,
  walletRejects: false,
}

interface ScenarioState {
  id: string
  faults: FaultRule[]
  flags: ScenarioFlags
  latencyOverrideMs: number | null
  paymentDelayMs: number
}

export const DEFAULT_PAYMENT_DELAY_MS = 2500

let state: ScenarioState = buildState('default')

function findScenario(id: string): ScenarioDefinition {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0]!
}

function buildState(id: string): ScenarioState {
  const scenario = findScenario(id)
  return {
    id: scenario.id,
    faults: (scenario.faults ?? []).map((rule) => ({ ...rule, times: rule.times ?? Number.POSITIVE_INFINITY })),
    flags: { ...DEFAULT_FLAGS, ...scenario.flags },
    latencyOverrideMs: null,
    paymentDelayMs: DEFAULT_PAYMENT_DELAY_MS,
  }
}

function persistState(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...state, faults: state.faults.map((rule) => ({ ...rule, times: Number.isFinite(rule.times) ? rule.times : -1 })) }),
    )
  } catch {
    /* storage unavailable: scenario stays in memory */
  }
}

export function loadScenario(): ScenarioState {
  const fromUrl = new URLSearchParams(window.location.search).get('mock-scenario')
  if (fromUrl && SCENARIOS.some((scenario) => scenario.id === fromUrl)) {
    state = buildState(fromUrl)
    persistState()
    return state
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ScenarioState
      state = {
        ...buildState(parsed.id),
        ...parsed,
        faults: parsed.faults.map((rule) => ({ ...rule, times: rule.times < 0 ? Number.POSITIVE_INFINITY : rule.times })),
      }
    }
  } catch {
    state = buildState('default')
  }
  return state
}

export function getScenario(): Readonly<ScenarioState> {
  return state
}

export function setScenario(id: string): void {
  state = buildState(id)
  persistState()
}

export function setLatencyOverride(ms: number | null): void {
  state = { ...state, latencyOverrideMs: ms }
  persistState()
}

export function setPaymentDelay(ms: number): void {
  state = { ...state, paymentDelayMs: ms }
  persistState()
}

export function setFlag(flag: keyof ScenarioFlags, value: boolean): void {
  state = { ...state, flags: { ...state.flags, [flag]: value } }
  persistState()
}

export function addFault(rule: FaultRule): void {
  state = { ...state, faults: [...state.faults, rule] }
  persistState()
}

export function consumeFlag(flag: keyof ScenarioFlags): boolean {
  if (!state.flags[flag]) return false
  setFlag(flag, false)
  return true
}

function matchesPath(pattern: string, pathname: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1)
    return pathname.startsWith(prefix) && pathname.length > prefix.length && !pathname.slice(prefix.length).includes('/')
  }
  return pattern === pathname
}

export function takeFault(method: string, pathname: string): FaultKind | null {
  const index = state.faults.findIndex(
    (rule) => rule.times > 0 && (rule.method === '*' || rule.method === method) && matchesPath(rule.path, pathname),
  )
  if (index === -1) return null
  const rule = state.faults[index]!
  if (Number.isFinite(rule.times)) {
    state = {
      ...state,
      faults: state.faults.map((current, position) => (position === index ? { ...current, times: current.times - 1 } : current)),
    }
    persistState()
  }
  return rule.fault
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function latencyFor(url: URL): number {
  if (state.latencyOverrideMs !== null) return state.latencyOverrideMs
  const scenario = findScenario(state.id)
  switch (scenario.latency) {
    case 'none':
      return 0
    case 'slow':
      return 2500
    case 'variable':
      return 200 + (hashString(url.pathname + url.search) % 1800)
    default:
      return 120
  }
}
