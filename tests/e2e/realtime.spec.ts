import { ANA, apiAddToCart, apiLogin, expect, goToReview, open, test } from './fixtures'

test.describe('Tempo real com Socket.IO', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await apiAddToCart(page, 'nft-002', 'nft-002-standard', 1)
  })

  test('alteração de preço no carrinho atualiza o resumo', async ({ page, mock }) => {
    await open(page, '/carrinho')
    await expect(page.getByTestId('summary-total')).toHaveText('2,4025 ETH')
    await mock.call('updateEdition', 'nft-002', 'nft-002-standard', { priceEth: '2.6' })
    await expect(page.getByText('O preço de Jaguar de Pixel (Edição Padrão) mudou de 2,4 ETH para 2,6 ETH.')).toBeVisible()
    await expect(page.getByTestId('cart-line')).toContainText('Preço atualizado: antes 2,4 ETH')
    await expect(page.getByTestId('summary-total')).toHaveText('2,6025 ETH')
  })

  test('checkout impede confirmação com cotação desatualizada', async ({ page, mock }) => {
    await goToReview(page)
    await mock.call('updateEdition', 'nft-002', 'nft-002-standard', { priceEth: '2.75' })
    await expect(page.getByTestId('stale-quote')).toContainText('Os valores do pedido mudaram')
    await expect(page.getByTestId('quote-changes')).toContainText('preço mudou de 2,4 ETH para 2,75 ETH')
    await expect(page.getByTestId('confirm-order')).toBeDisabled()

    await page.getByRole('button', { name: 'Atualizar revisão' }).click()
    await expect(page.getByTestId('stale-quote')).toHaveCount(0)
    await expect(page.getByTestId('summary-total')).toHaveText('2,7525 ETH')
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 })
  })

  test('preço alterado no envio exige nova confirmação (409)', async ({ page, mock }) => {
    await mock.call('setScenario', 'price-change')
    await goToReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('stale-quote')).toBeVisible()
    await expect(page.getByTestId('confirm-order')).toBeDisabled()
    expect(await mock.call<unknown[]>('orders')).toHaveLength(0)
    await page.getByRole('button', { name: 'Atualizar revisão' }).click()
    await expect(page.getByTestId('summary-total')).toHaveText('2,6425 ETH')
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 })
  })

  test('edição esgotada durante a compra bloqueia o pedido', async ({ page, mock }) => {
    await mock.call('setScenario', 'sold-out')
    await goToReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('quote-changes')).toContainText('edição esgotada')
    await page.getByRole('button', { name: 'Atualizar revisão' }).click()
    await expect(page.getByText('Alguns itens não estão disponíveis')).toBeVisible()
    await page.getByRole('link', { name: 'Ajustar carrinho' }).click()
    await expect(page.getByTestId('cart-line')).toContainText('Esgotado. Remova o item para continuar.')
  })

  test('eventos duplicados ou antigos não regridem o estado', async ({ page, mock }) => {
    await open(page, '/nft/nft-002?edition=nft-002-standard')
    const price = page.getByRole('radio', { name: /Edição Padrão/ })
    await mock.call('updateEdition', 'nft-002', 'nft-002-standard', { priceEth: '3' })
    await expect(price).toHaveAccessibleName(/3 ETH/)
    await mock.call('updateEdition', 'nft-002', 'nft-002-standard', { priceEth: '3.5' })
    await expect(price).toHaveAccessibleName(/3,5 ETH/)

    await mock.call('replayStaleNftEvent', 'nft-002')
    await mock.call('replayLastEvent', 'nft.updated')
    await page.waitForTimeout(500)
    await expect(price).toHaveAccessibleName(/3,5 ETH/)
  })

  test('desconexão com pedido pendente e retomada sem nova compra', async ({ page, mock }) => {
    await mock.call('setPaymentDelay', 60_000)
    await goToReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'pending')

    await mock.call('setRealtimeOffline', true)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'reconnecting')
    await mock.call('resolvePendingOrders')
    await mock.call('setRealtimeOffline', false)
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed')
    expect(await mock.call<unknown[]>('orders')).toHaveLength(1)
  })

  test('refresh com pedido pendente recupera o mesmo pedido', async ({ page, mock }) => {
    await mock.call('setPaymentDelay', 4_000)
    await goToReview(page)
    await page.getByTestId('confirm-order').click()
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'pending')
    const url = page.url()
    await page.reload()
    expect(page.url()).toBe(url)
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 })
    await open(page, '/checkout')
    await expect(page.getByText('Não há itens para pagar')).toBeVisible()
    expect(await mock.call<unknown[]>('orders')).toHaveLength(1)
  })
})
