/**
 * Entry point: starts the mock backend when enabled by configuration, then renders the app.
 * The app is imported only after the mocks start because engine.io-client captures the global
 * WebSocket constructor at module evaluation time, before MSW could patch it otherwise.
 * If either stage fails (or the mock start hangs), a static, accessible error screen replaces
 * the empty root instead of leaving the page blank or rendering an app without its backend.
 */
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import './styles/globals.css'
import { BootError, renderBootFailure, withTimeout } from './app/boot-failure'

const MOCK_START_TIMEOUT_MS = 20_000

async function startMocks(): Promise<void> {
  if (import.meta.env.VITE_ENABLE_MOCKS !== 'true') return
  try {
    const { startMockBackend } = await import('./mocks/browser')
    await withTimeout(startMockBackend(), MOCK_START_TIMEOUT_MS)
  } catch (error) {
    throw new BootError('mock', error)
  }
}

async function renderApp(container: HTMLElement): Promise<void> {
  try {
    const [{ StrictMode, createElement }, { createRoot }, { App }] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('./app/app'),
    ])
    createRoot(container).render(createElement(StrictMode, null, createElement(App)))
  } catch (error) {
    throw new BootError('app', error)
  }
}

async function bootstrap() {
  const container = document.getElementById('root')
  if (!container) throw new Error('Root element not found')
  try {
    await startMocks()
    await renderApp(container)
  } catch (error) {
    console.error('[boot]', error)
    renderBootFailure(container, error instanceof BootError ? error.stage : 'app')
  }
}

void bootstrap()
