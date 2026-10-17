/**
 * Static fallback rendered when the application cannot start (mock backend unavailable or the
 * app bundle failed to load). Built with plain DOM APIs because React itself may be what failed.
 * Exposes `BootError` (classifies the failing stage), `withTimeout` (turns a hung start into an
 * error) and `renderBootFailure` (idempotent: replaces the root content with a single alert and a
 * manual reload action; there is no automatic retry).
 */
export type BootStage = 'mock' | 'app'

export class BootError extends Error {
  readonly stage: BootStage

  constructor(stage: BootStage, cause: unknown) {
    super(`Application boot failed at stage "${stage}"`, { cause })
    this.name = 'BootError'
    this.stage = stage
  }
}

export function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs)
    task.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const MESSAGES: Record<BootStage, { title: string; description: string; hint: string }> = {
  mock: {
    title: 'Não foi possível iniciar o ambiente de demonstração',
    description:
      'Esta demonstração usa um service worker para simular a API e o tempo real. O navegador bloqueou ou não concluiu o registro dele, então a loja não está disponível agora.',
    hint: 'Saia da janela anônima ou privada, permita cookies e dados de sites para este endereço e recarregue a página.',
  },
  app: {
    title: 'Não foi possível carregar a aplicação',
    description: 'Parte dos arquivos da loja não foi carregada, então ela não está disponível agora.',
    hint: 'Verifique sua conexão e recarregue a página.',
  },
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

export function renderBootFailure(container: HTMLElement, stage: BootStage): void {
  if (container.querySelector('[data-boot-failure]')) return
  const copy = MESSAGES[stage]

  const main = element('main', 'mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12')
  const panel = element('section', 'flex flex-col items-start gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6')
  panel.setAttribute('role', 'alert')
  panel.setAttribute('aria-labelledby', 'boot-failure-title')
  panel.dataset.bootFailure = stage

  const title = element('h1', 'font-display text-xl font-semibold text-foreground', copy.title)
  title.id = 'boot-failure-title'
  title.tabIndex = -1

  const reload = element(
    'button',
    'inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'Recarregar a página',
  )
  reload.type = 'button'
  reload.addEventListener('click', () => window.location.reload(), { once: true })

  panel.append(
    title,
    element('p', 'text-sm text-muted-foreground', copy.description),
    element('p', 'text-sm text-foreground', copy.hint),
    reload,
  )
  main.append(panel)
  container.replaceChildren(main)
  document.title = 'Indisponível · Jungle NFT Marketplace'
  title.focus()
}
