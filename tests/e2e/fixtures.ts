/**
 * Shared Playwright fixtures. Every test runs in a fresh browser context, so the mock database,
 * MSW cookie jar and scenario all start from the deterministic seed. The `mock` helper drives
 * the mock backend through `window.__jungleMock` (server-side state; the app only observes the
 * effects through REST and Socket.IO).
 */
import { type Page, expect, test as base } from '@playwright/test'

export const ANA = { email: 'ana@jungle.test', password: 'Jungle@2026', name: 'Ana Ribeiro' }
export const BRUNO = { email: 'bruno@jungle.test', password: 'Jungle@2026', name: 'Bruno Lima' }

export async function waitForApp(page: Page) {
  await page.waitForFunction(() => Boolean(window.__jungleMock))
  await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
}

export async function open(page: Page, path: string, options: { scenario?: string } = {}) {
  const separator = path.includes('?') ? '&' : '?'
  await page.goto(options.scenario ? `${path}${separator}mock-scenario=${options.scenario}` : path)
  await waitForApp(page)
}

export async function apiLogin(page: Page, user: { email: string; password: string }) {
  const status = await page.evaluate(async ({ email, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jungle-web' },
      body: JSON.stringify({ email, password }),
    })
    return response.status
  }, user)
  expect(status).toBe(200)
}

export async function apiAddToCart(page: Page, nftId: string, editionId: string, quantity = 1) {
  const status = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jungle-web' },
        body: JSON.stringify(body),
      })
      return response.status
    },
    { nftId, editionId, quantity },
  )
  expect(status).toBe(200)
}

export async function uiLogin(page: Page, user: { email: string; password: string }) {
  await page.getByLabel('E-mail').fill(user.email)
  await page.getByLabel('Senha', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

export async function chooseOption(page: Page, trigger: string | RegExp, option: string | RegExp) {
  await page.getByRole('combobox', { name: trigger }).click()
  await page.getByRole('option', { name: option }).click()
}

export async function goToReview(page: Page) {
  await open(page, '/checkout')
  await page.getByRole('button', { name: 'Continuar para carteira' }).click()
  await page.getByTestId('connect-wallet').click()
  await expect(page.getByTestId('wallet-connection')).toContainText('Conectada')
  await page.getByRole('button', { name: 'Revisar pedido' }).click()
  await expect(page.getByTestId('confirm-order')).toBeEnabled()
}

type MockApi = {
  call: <T = unknown>(method: string, ...args: unknown[]) => Promise<T>
}

export const test = base.extend<{ mock: MockApi }>({
  mock: async ({ page }, provide) => {
    await provide({
      call: (method, ...args) =>
        page.evaluate(
          ({ method: name, args: values }) => {
            const control = window.__jungleMock as unknown as Record<string, (...input: unknown[]) => unknown>
            return control[name]!(...values)
          },
          { method, args },
        ) as never,
    })
  },
})

export { expect }

declare global {
  interface Window {
    __jungleMock?: unknown
  }
}
