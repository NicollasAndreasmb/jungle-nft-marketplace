import { ANA, apiLogin, expect, open, test } from './fixtures'

test.describe('Isolamento de sessão', () => {
  test('logout em outra aba limpa os dados privados desta aba', async ({ page, context }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await open(page, '/perfil')
    await expect(page.getByLabel('Nome', { exact: true })).toHaveValue(ANA.name)

    const other = await context.newPage()
    await open(other, '/')
    await other.getByTestId('account-menu').click()
    await other.getByRole('menuitem', { name: 'Sair' }).click()
    await expect(other.getByRole('link', { name: 'Entrar' })).toBeVisible()

    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible()
    await expect(page.getByLabel('Nome', { exact: true })).toHaveCount(0)
  })

  test('sessão revogada encerra o socket autenticado', async ({ page, mock }) => {
    await open(page, '/')
    await apiLogin(page, ANA)
    await open(page, '/perfil')
    await expect.poll(() => mock.call<{ authenticated: number }>('realtimeStatus').then((status) => status.authenticated)).toBe(1)
    await mock.call('expireSession')
    await expect.poll(() => mock.call<{ authenticated: number }>('realtimeStatus').then((status) => status.authenticated)).toBe(0)
  })
})
