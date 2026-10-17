import { expect, open, test } from './fixtures'

const BOOT_FAILURE = '[data-boot-failure]'

test.describe('Inicialização', () => {
  test('inicia o mock e renderiza a loja sem tela de falha', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator(BOOT_FAILURE)).toHaveCount(0)
    await expect(page.getByRole('banner')).toBeVisible()
  })

  test.describe('com service worker bloqueado', () => {
    test.use({ serviceWorkers: 'block' })

    test('informa a indisponibilidade, orienta a recuperação e não entra em loop', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().startsWith('[boot]')) errors.push(message.text())
      })
      await page.goto('/nft/nft-002')

      const alert = page.getByRole('alert')
      await expect(alert).toHaveCount(1)
      await expect(alert).toHaveAttribute('data-boot-failure', 'mock')
      const heading = page.getByRole('heading', { level: 1, name: 'Não foi possível iniciar o ambiente de demonstração' })
      await expect(heading).toBeFocused()
      await expect(alert).toContainText('recarregue a página')
      await expect(page).toHaveTitle(/^Indisponível/)
      await expect(page.getByRole('banner')).toHaveCount(0)
      expect(await page.evaluate(() => window.__jungleMock === undefined)).toBe(true)

      await page.getByRole('button', { name: 'Recarregar a página' }).click()
      await expect(page.getByRole('heading', { level: 1, name: /ambiente de demonstração/ })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(1)
      await expect(page).toHaveURL(/\/nft\/nft-002$/)
      expect(errors).toHaveLength(2)
    })
  })

  test('falha ao carregar o bundle da aplicação exibe orientação de recarga', async ({ page, context }) => {
    await context.route(/\/assets\/app-[^/]+\.js$/, (route) => route.abort('failed'))
    await page.goto('/')

    const alert = page.getByRole('alert')
    await expect(alert).toHaveAttribute('data-boot-failure', 'app')
    await expect(page.getByRole('heading', { level: 1, name: 'Não foi possível carregar a aplicação' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Recarregar a página' })).toBeVisible()

    await context.unroute(/\/assets\/app-[^/]+\.js$/)
    await page.getByRole('button', { name: 'Recarregar a página' }).click()
    await expect(page.locator(BOOT_FAILURE)).toHaveCount(0)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
  })
})
