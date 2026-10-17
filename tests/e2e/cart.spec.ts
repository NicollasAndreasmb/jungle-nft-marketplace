import { ANA, apiAddToCart, expect, open, test, uiLogin } from './fixtures'

test.describe('Carrinho', () => {
  test('quantidades, remoção, cupom e persistência após refresh e login', async ({ page }) => {
    await open(page, '/nft/nft-002?edition=nft-002-standard')
    await page.getByTestId('add-to-cart').click()
    await expect(page.getByText(/adicionado ao carrinho/)).toBeVisible()
    await open(page, '/nft/nft-005')
    await page.getByTestId('add-to-cart').click()
    await expect(page.getByRole('link', { name: 'Carrinho, 2 itens' })).toBeVisible()

    await open(page, '/carrinho')
    const lines = page.getByTestId('cart-line')
    await expect(lines).toHaveCount(2)
    const total = page.getByTestId('summary-total')
    const initialTotal = await total.textContent()

    await lines.first().getByRole('button', { name: 'Aumentar quantidade' }).click()
    await expect(lines.first().locator('output')).toHaveText('2')
    await expect(total).not.toHaveText(initialTotal ?? '')

    await lines.nth(1).getByRole('button', { name: /^Remover/ }).click()
    await expect(lines).toHaveCount(1)

    const coupon = page.getByLabel('Cupom de desconto')
    await coupon.fill('INVALIDO')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByText('Cupom inválido. Confira o código.')).toBeVisible()
    await expect(coupon).toHaveAttribute('aria-invalid', 'true')
    await coupon.fill('EXPIRED20')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByText('Este cupom expirou.')).toBeVisible()
    await coupon.fill('jungle10')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page.getByTestId('applied-coupon')).toContainText('JUNGLE10')
    await expect(page.getByTestId('price-summary')).toContainText('− 0,48 ETH')

    await page.reload()
    await expect(page.getByTestId('cart-line')).toHaveCount(1)
    await expect(page.getByTestId('applied-coupon')).toBeVisible()
    await page.getByTestId('applied-coupon').getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByLabel('Cupom de desconto')).toBeVisible()

    await page.getByTestId('go-to-checkout').click()
    await expect(page).toHaveURL(/\/login/)
    await uiLogin(page, ANA)
    await expect(page).toHaveURL(/\/checkout/)
    await open(page, '/carrinho')
    await expect(page.getByTestId('cart-line')).toHaveCount(1)
    await expect(page.getByTestId('cart-line').locator('output')).toHaveText('2')
  })

  test('limite de disponibilidade retornado pela API', async ({ page }) => {
    await open(page, '/')
    await apiAddToCart(page, 'nft-002', 'nft-002-genesis', 1)
    await open(page, '/nft/nft-002?edition=nft-002-genesis')
    await page.getByTestId('add-to-cart').click()
    await expect(page.getByText('O limite é de 1 unidade(s) por pedido para esta edição.')).toBeVisible()
  })
})
