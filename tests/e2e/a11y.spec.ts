import { expect, open, test } from './fixtures'

test.describe('Acessibilidade e teclado', () => {
  test('skip link leva ao conteúdo principal', async ({ page }) => {
    await open(page, '/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#conteudo$/)
  })

  test('drawer de filtros controla o foco e devolve ao gatilho', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, '/')
    const trigger = page.getByRole('button', { name: /^Filtros/ })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Filtros' })
    await expect(dialog).toBeVisible()
    for (let index = 0; index < 25; index += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('menu mobile acessível por teclado', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, '/')
    await page.getByRole('button', { name: 'Abrir menu' }).focus()
    await page.keyboard.press('Enter')
    const nav = page.getByRole('navigation', { name: 'Menu principal' })
    await expect(nav).toBeVisible()
    await nav.getByRole('link', { name: 'Entrar' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/login/)
  })

  test('erros de formulário associados aos campos e foco no primeiro inválido', async ({ page }) => {
    await open(page, '/login')
    await page.getByRole('button', { name: 'Entrar' }).click()
    const email = page.getByLabel('E-mail')
    await expect(email).toBeFocused()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAccessibleDescription('Informe um e-mail válido')
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAccessibleDescription('Informe a senha')
  })

  test('catálogo operável por teclado até o detalhe', async ({ page }) => {
    await open(page, '/')
    await page.getByRole('searchbox', { name: 'Buscar NFTs' }).focus()
    await page.keyboard.type('Tucano')
    await expect(page.getByTestId('catalog-count')).toHaveText('1 NFT encontrado')
    const card = page.getByTestId('catalog-grid').getByRole('link', { name: 'Tucano 8-bit' })
    await card.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Tucano 8-bit' })).toBeFocused()
  })
})
