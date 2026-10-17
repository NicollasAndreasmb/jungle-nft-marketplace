import { expect, open, test } from './fixtures'

test.describe('Carregamento, falhas e recuperação', () => {
  test('skeletons durante rede lenta no catálogo e no detalhe', async ({ page }) => {
    await page.goto('/?mock-scenario=slow')
    await expect(page.getByTestId('nft-card-skeleton').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('catalog-grid')).toBeVisible({ timeout: 15_000 })

    await page.goto('/nft/nft-002')
    await expect(page.getByTestId('nft-detail-skeleton')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Jaguar de Pixel' })).toBeVisible({ timeout: 15_000 })
  })

  test('skeleton do resumo do carrinho durante rede lenta', async ({ page }) => {
    await page.goto('/carrinho?mock-scenario=slow')
    await expect(page.getByTestId('cart-skeleton')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeVisible({ timeout: 15_000 })
  })

  test('erro HTTP 500 no catálogo e recuperação após nova tentativa', async ({ page, mock }) => {
    await open(page, '/', { scenario: 'server-error' })
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Erro interno do servidor.').first()).toBeVisible()
    await mock.call('setScenario', 'default')
    await page.getByRole('alert').filter({ hasText: 'Não foi possível carregar o catálogo' }).getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('catalog-grid')).toBeVisible()
  })

  test('falha de conexão exibe feedback e recupera', async ({ page, mock }) => {
    await open(page, '/nft/nft-002')
    await mock.call('setScenario', 'offline')
    await page.goto('/nft/nft-003')
    await page.waitForFunction(() => Boolean(window.__jungleMock))
    await expect(page.getByText('Não foi possível conectar. Verifique sua conexão e tente novamente.')).toBeVisible({ timeout: 15_000 })
    await mock.call('setScenario', 'default')
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('falha transitória é recuperada por retry automático', async ({ page }) => {
    await open(page, '/', { scenario: 'flaky' })
    await expect(page.getByTestId('catalog-count')).toHaveText('36 NFTs encontrados', { timeout: 15_000 })
  })
})
