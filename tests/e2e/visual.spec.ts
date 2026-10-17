import { type Page } from '@playwright/test'
import { ANA, apiAddToCart, apiLogin, expect, open, test } from './fixtures'

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() =>
    Array.from(document.images)
      .filter((image) => image.getBoundingClientRect().top < window.innerHeight)
      .every((image) => image.complete && image.naturalWidth > 0),
  )
  await page.mouse.move(0, 0)
}

test.describe('Regressão visual', () => {
  test('início', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByTestId('catalog-grid')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('inicio.png')
  })

  test('detalhe', async ({ page }) => {
    await open(page, '/nft/nft-002')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('detalhe.png')
  })

  test('carrinho', async ({ page }) => {
    await open(page, '/')
    await apiAddToCart(page, 'nft-002', 'nft-002-standard', 2)
    await apiAddToCart(page, 'nft-008', 'nft-008-standard', 1)
    await open(page, '/carrinho')
    await expect(page.getByTestId('cart-line')).toHaveCount(2)
    await settle(page)
    await expect(page).toHaveScreenshot('carrinho.png')
  })

  test('pagamento', async ({ page }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await apiAddToCart(page, 'nft-002', 'nft-002-standard', 1)
    await open(page, '/checkout')
    await expect(page.getByRole('heading', { name: 'Dados do colecionador' })).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('pagamento.png')
  })
})
