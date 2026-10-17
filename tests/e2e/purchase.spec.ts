import { ANA, expect, open, test, uiLogin } from './fixtures'

test.describe('Compra completa', () => {
  test('do catálogo ao recibo confirmado, com snapshot imutável', async ({ page, mock }) => {
    await open(page, '/?q=Jaguar')
    await page.getByTestId('catalog-grid').getByRole('link', { name: 'Jaguar de Pixel' }).click()
    await page.getByRole('radio', { name: /Edição Aberta/ }).click()
    await page.getByRole('button', { name: 'Aumentar quantidade' }).click()
    await page.getByTestId('add-to-cart').click()
    await expect(page.getByRole('link', { name: 'Carrinho, 2 itens' })).toBeVisible()

    await page.getByRole('link', { name: 'Carrinho, 2 itens' }).click()
    await page.getByTestId('go-to-checkout').click()
    await uiLogin(page, ANA)
    await expect(page).toHaveURL(/\/checkout/)

    await page.getByLabel('Nome completo').fill('')
    await page.getByRole('button', { name: 'Continuar para carteira' }).click()
    await expect(page.getByLabel('Nome completo')).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel('Nome completo').fill('Ana Ribeiro')
    await page.getByRole('button', { name: 'Continuar para carteira' }).click()

    await page.getByRole('combobox', { name: 'Rede' }).click()
    await page.getByRole('option', { name: 'Polygon' }).click()
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('wallet-connection')).toContainText('Conectada')
    await page.getByRole('button', { name: 'Revisar pedido' }).click()

    const confirm = page.getByTestId('confirm-order')
    await expect(confirm).toBeEnabled()
    await expect(page.getByTestId('price-summary')).toContainText('Taxa de rede (Polygon)')
    await expect(page.getByTestId('summary-total')).toHaveText('2,4001 ETH')
    await confirm.click()

    await expect(page).toHaveURL(/\/pedidos\/order_/)
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 })
    await expect(page.getByTestId('receipt-items')).toContainText('2 × 1,2 ETH')
    await expect(page.getByTestId('transaction-hash')).toHaveText(/^0x[0-9a-f]{64}$/)
    await expect(page.getByRole('link', { name: 'Carrinho, 0 itens' })).toBeVisible()

    await mock.call('updateEdition', 'nft-002', 'nft-002-open', { priceEth: '9.99' })
    await page.reload()
    await expect(page.getByTestId('receipt-items')).toContainText('2 × 1,2 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('2,4001 ETH')

    await page.getByRole('button', { name: 'Ver no explorador (simulado)' }).click()
    await expect(page.getByRole('dialog', { name: 'Transação simulada' })).toBeVisible()
  })
})
