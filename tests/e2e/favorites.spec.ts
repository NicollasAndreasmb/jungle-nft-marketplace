import { ANA, apiLogin, expect, open, test } from './fixtures'

test.describe('Favoritos', () => {
  test('visitante é enviado ao login', async ({ page }) => {
    await open(page, '/nft/nft-002')
    await page.getByTestId('favorite-toggle').click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fnft%2Fnft-002/)
  })

  test('inclusão otimista persiste após refresh', async ({ page }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await open(page, '/nft/nft-002')
    const toggle = page.getByTestId('favorite-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Adicionado aos favoritos.')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true')
  })

  test('falha da mutation faz rollback e o estado se recupera', async ({ page, mock }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await open(page, '/nft/nft-002', { scenario: 'favorite-failure' })
    const toggle = page.getByTestId('favorite-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(page.getByText(/Não foi possível atualizar o favorito/)).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await mock.call('setScenario', 'default')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Adicionado aos favoritos.')).toBeVisible()
    await page.goto('/nft/nft-002')
    await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true')
  })
})
