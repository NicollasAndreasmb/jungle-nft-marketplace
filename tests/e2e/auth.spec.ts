import { ANA, BRUNO, apiLogin, expect, open, test, uiLogin } from './fixtures'

test.describe('Conta e sessão', () => {
  test('cadastro com validação, conflito e sucesso', async ({ page }) => {
    await open(page, '/cadastro')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByLabel('Nome')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Nome')).toBeFocused()
    await expect(page.getByText('Informe pelo menos 2 caracteres')).toBeVisible()

    await page.getByLabel('Nome').fill('Carla Teste')
    await page.getByLabel('E-mail').fill(ANA.email)
    await page.getByLabel('Senha', { exact: true }).fill('senhafraca')
    await page.getByLabel('Confirmar senha').fill('outra')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByText('A senha deve conter ao menos um número')).toBeVisible()

    await page.getByLabel('Senha', { exact: true }).fill('Carla2026!')
    await page.getByLabel('Confirmar senha').fill('Carla2026!')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page.getByText('Este e-mail já está cadastrado. Entre ou use outro e-mail.')).toBeVisible()

    await page.getByLabel('E-mail').fill('carla@jungle.test')
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('realtime-status')).toBeVisible()
    await page.reload()
    await page.goto('/perfil')
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Carla Teste')
  })

  test('login inválido e retorno ao fluxo anterior', async ({ page }) => {
    await open(page, '/carteiras')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcarteiras/)
    await uiLogin(page, { email: ANA.email, password: 'errada123' })
    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    await uiLogin(page, ANA)
    await expect(page).toHaveURL(/\/carteiras$/)
    await expect(page.getByRole('heading', { name: 'Carteiras', level: 1 })).toBeVisible()
  })

  test('sessão recuperada após refresh e expiração durante a navegação', async ({ page, mock }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await open(page, '/perfil')
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(ANA.name)
    await page.reload()
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(ANA.name)

    await mock.call('expireSession')
    await page.getByRole('tab', { name: 'Favoritos' }).click()
    await expect(page).toHaveURL(/\/login\?.*reason=expired/)
    await expect(page.getByText('Sua sessão expirou. Entre novamente para continuar de onde parou.')).toBeVisible()
    await uiLogin(page, ANA)
    await expect(page).toHaveURL(/\/perfil/)
  })

  test('logout e troca de usuário limpam dados privados', async ({ page }) => {
    await open(page, '/login')
    await uiLogin(page, ANA)
    await expect(page).toHaveURL(/\/$/)
    await open(page, '/perfil')
    await page.getByRole('tab', { name: 'Favoritos' }).click()
    await expect(page.getByRole('tabpanel').getByRole('link', { name: 'Aurora na Copa' })).toBeVisible()

    if (await page.getByRole('button', { name: 'Abrir menu' }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menu' }).click()
      await page.getByRole('button', { name: 'Sair' }).click()
    } else {
      await page.getByTestId('account-menu').click()
      await page.getByRole('menuitem', { name: 'Sair' }).click()
    }
    await expect(page.getByText('Você saiu da sua conta.')).toBeVisible()
    await page.goto('/perfil')
    await expect(page).toHaveURL(/\/login/)

    await uiLogin(page, BRUNO)
    await expect(page).toHaveURL(/\/perfil/)
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(BRUNO.name)
    await page.getByRole('tab', { name: 'Favoritos' }).click()
    await expect(page.getByText('Nenhum favorito ainda')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Aurora na Copa' })).toHaveCount(0)
  })
})
