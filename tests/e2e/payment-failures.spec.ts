import { ANA, apiAddToCart, apiLogin, expect, goToReview, open, test } from './fixtures'

test.describe('Falhas de pagamento e idempotência', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await apiAddToCart(page, 'nft-002', 'nft-002-standard', 1)
  })

  test('pagamento recusado preserva os itens do carrinho', async ({ page, mock }) => {
    await mock.call('setScenario', 'payment-declined')
    await goToReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'rejected', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Pagamento recusado' })).toBeVisible()
    await expect(page.getByText('Compra confirmada')).toHaveCount(0)
    await page.getByRole('link', { name: 'Voltar ao carrinho' }).click()
    await expect(page.getByTestId('cart-line')).toHaveCount(1)
  })

  test('cliques repetidos criam um único pedido', async ({ page, mock }) => {
    await goToReview(page)
    const confirm = page.getByTestId('confirm-order')
    await confirm.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
      button.click()
    })
    await expect(page).toHaveURL(/\/pedidos\//)
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 })
    const orders = await mock.call<unknown[]>('orders')
    expect(orders).toHaveLength(1)
  })

  test('timeout após criação recupera o mesmo pedido pela chave de idempotência', async ({ page, mock }) => {
    await mock.call('setScenario', 'order-timeout')
    await goToReview(page)
    const keys: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/orders') {
        keys.push(request.headers()['idempotency-key'] ?? '')
      }
    })
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-submitting')).toBeVisible()
    await expect(page).toHaveURL(/\/pedidos\//, { timeout: 20_000 })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
    expect(keys[1]).toBe(keys[0])
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 })
    const orders = await mock.call<unknown[]>('orders')
    expect(orders).toHaveLength(1)
  })

  test('recusa da conexão da carteira', async ({ page, mock }) => {
    await mock.call('setScenario', 'wallet-rejects')
    await open(page, '/checkout')
    await page.getByRole('button', { name: 'Continuar para carteira' }).click()
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByText('A conexão foi recusada na carteira.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revisar pedido' })).toBeDisabled()
    await mock.call('setScenario', 'default')
    await page.getByTestId('connect-wallet').click()
    await expect(page.getByTestId('wallet-connection')).toContainText('Conectada')
    await page.getByRole('button', { name: 'Desconectar' }).click()
    await expect(page.getByTestId('wallet-connection')).toContainText('Carteira desconectada')
  })

  test('sessão expirada no checkout preserva o contexto para retomada', async ({ page, mock }) => {
    await goToReview(page)
    await mock.call('expireSession')
    await page.getByTestId('confirm-order').click()
    await expect(page).toHaveURL(/\/login\?.*reason=expired/)
    await page.getByLabel('E-mail').fill(ANA.email)
    await page.getByLabel('Senha', { exact: true }).fill(ANA.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL(/\/checkout/)
    await expect(page.getByRole('heading', { name: /Carteira e rede|Revisão do pedido/ })).toBeVisible()
    const orders = await mock.call<unknown[]>('orders')
    expect(orders).toHaveLength(0)
  })
})
