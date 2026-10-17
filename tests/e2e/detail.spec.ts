import { expect, open, test } from './fixtures'

test.describe('Detalhe do NFT', () => {
  test('acesso direto, galeria e limite de quantidade', async ({ page }) => {
    await open(page, '/nft/nft-002')
    await expect(page.getByRole('heading', { level: 1, name: 'Jaguar de Pixel' })).toBeVisible()

    await page.getByRole('button', { name: 'Mostrar imagem 2 de 3' }).click()
    await expect(page.getByRole('button', { name: 'Mostrar imagem 2 de 3' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('radio', { name: /Edição Padrão/ }).click()
    await expect(page).toHaveURL(/edition=nft-002-standard/)
    await expect(page.getByText('Máximo de 5 nesta compra.')).toBeVisible()
    const increase = page.getByRole('button', { name: 'Aumentar quantidade' })
    for (let index = 0; index < 4; index += 1) await increase.click()
    await expect(page.getByRole('group', { name: 'Quantidade' }).locator('output')).toHaveText('5')
    await expect(increase).toBeDisabled()
  })

  test('NFT inexistente', async ({ page }) => {
    await open(page, '/nft/nao-existe')
    await expect(page.getByRole('heading', { level: 1, name: 'NFT não encontrado' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar ao catálogo' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('edição indisponível e NFT esgotado', async ({ page }) => {
    await open(page, '/nft/nft-001')
    await expect(page.getByRole('radio', { name: /Edição Genesis/ })).toBeDisabled()
    await expect(page.getByRole('radio', { name: /Edição Padrão/ })).toBeChecked()

    await open(page, '/nft/nft-004')
    await expect(page.getByText('Edição indisponível no momento.')).toBeVisible()
    await expect(page.getByTestId('add-to-cart')).toBeDisabled()
  })

  test('rota inexistente', async ({ page }) => {
    await open(page, '/rota/que/nao/existe')
    await expect(page.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible()
  })
})
