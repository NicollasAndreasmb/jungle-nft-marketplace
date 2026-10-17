import { type Page } from '@playwright/test'
import { expect, open, test } from './fixtures'

async function withFilters(page: Page, isMobile: boolean, action: () => Promise<void>) {
  if (isMobile) await page.getByRole('button', { name: /^Filtros/ }).click()
  await action()
  if (isMobile) await page.keyboard.press('Escape')
}

function parseEth(text: string): number {
  return Number(text.replace(/[^\d,]/g, '').replace(',', '.'))
}

test.describe('Catálogo', () => {
  test('busca, filtros combinados, ordenação, paginação e restauração pelo histórico', async ({ page, isMobile }) => {
    await open(page, '/')
    const count = page.getByTestId('catalog-count')
    await expect(count).toHaveText('36 NFTs encontrados')

    await page.getByRole('link', { name: 'Página 2' }).click()
    await expect(page).toHaveURL(/[?&]page=2/)
    await expect(page.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')

    await withFilters(page, isMobile, async () => {
      await page.getByRole('checkbox', { name: 'Arte' }).click()
      await expect(page).toHaveURL(/category=art/)
      await expect(page).not.toHaveURL(/page=/)
      await page.getByRole('radio', { name: 'Disponíveis' }).click()
      await expect(page).toHaveURL(/availability=available/)
    })
    await expect(count).not.toHaveText('36 NFTs encontrados')
    await expect(count).toHaveText(/^\d+ NFTs? encontrados?$/)
    const combined = Number((await count.textContent())?.match(/\d+/)?.[0])
    expect(combined).toBeGreaterThan(0)
    expect(combined).toBeLessThan(36)

    await page.getByRole('combobox', { name: 'Ordenar por' }).click()
    await page.getByRole('option', { name: 'Menor preço' }).click()
    await expect(page).toHaveURL(/sort=price-asc/)
    await expect(page.getByTestId('catalog-grid')).toHaveAttribute('aria-busy', 'false')
    const prices = (await page.getByTestId('catalog-grid').locator('article').allTextContents())
      .map((text) => text.match(/A partir de([\d.,]+)/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(parseEth)
    expect(prices.length).toBeGreaterThan(1)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)

    await page.reload()
    await expect(page).toHaveURL(/category=art.*availability=available.*sort=price-asc|sort=price-asc.*category=art/)
    await expect(count).toHaveText(`${combined} NFTs encontrados`)

    await page.getByRole('searchbox', { name: 'Buscar NFTs' }).fill('jaguar')
    await expect(page).toHaveURL(/q=jaguar/)
    await expect(count).toHaveText(/NFT(s)? encontrado/)

    await page.goBack()
    await expect(page).not.toHaveURL(/q=jaguar/)
    await expect(page).toHaveURL(/sort=price-asc/)
    await page.goBack()
    await expect(page).not.toHaveURL(/sort=/)
    await expect(count).toHaveText(`${combined} NFTs encontrados`)
    await page.goForward()
    await expect(page).toHaveURL(/sort=price-asc/)
  })

  test('busca sem resultados e limpeza de filtros', async ({ page }) => {
    await open(page, '/?q=inexistente-xyz')
    await expect(page.getByRole('heading', { name: 'Nenhum NFT encontrado' })).toBeVisible()
    await page.getByRole('button', { name: 'Limpar filtros' }).click()
    await expect(page.getByTestId('catalog-count')).toHaveText('36 NFTs encontrados')
  })

  test('respostas fora de ordem não sobrescrevem a busca mais recente', async ({ page }) => {
    await open(page, '/', { scenario: 'variable-latency' })
    await expect(page.getByTestId('catalog-grid')).toBeVisible({ timeout: 15_000 })
    const search = page.getByRole('searchbox', { name: 'Buscar NFTs' })
    await search.fill('a')
    await expect(page).toHaveURL(/q=a/)
    await search.fill('Jaguar de Pixel')
    await expect(page).toHaveURL(/q=Jaguar/)
    await expect(page.getByTestId('catalog-count')).toHaveText('1 NFT encontrado', { timeout: 15_000 })
    await page.waitForTimeout(2_500)
    await expect(page.getByTestId('catalog-count')).toHaveText('1 NFT encontrado')
    await expect(page.getByTestId('catalog-grid').getByRole('link', { name: 'Jaguar de Pixel' })).toBeVisible()
  })

  test('catálogo vazio exibe estado informativo', async ({ page }) => {
    await open(page, '/', { scenario: 'empty-catalog' })
    await expect(page.getByText('O catálogo ainda não tem itens publicados.')).toBeVisible()
    await expect(page.getByText('Nenhum destaque disponível no momento.')).toBeVisible()
  })

  test('navega do catálogo para o NFT', async ({ page }) => {
    await open(page, '/')
    await page.getByTestId('catalog-grid').getByRole('link').first().click()
    await expect(page).toHaveURL(/\/nft\/nft-\d{3}/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
