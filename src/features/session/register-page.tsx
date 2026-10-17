/**
 * Registration: validated form (same rules as the API), password confirmation, e-mail conflict
 * handling from the API and safe return to the previous flow after the account is created.
 */
import { getRouteApi, Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { registerRequestSchema } from '@/api/contracts'
import { Field, FormError } from '@/components/form/field'
import { useZodForm } from '@/components/form/use-zod-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { useDocumentTitle } from '@/lib/use-document-title'
import { AuthLayout } from './auth-layout'
import { useRegister } from './session-queries'

const routeApi = getRouteApi('/cadastro')

const registerFormSchema = registerRequestSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirme a senha') })
  .refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'As senhas não coincidem' })

export function RegisterPage() {
  useDocumentTitle('Criar conta')
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const register = useRegister()
  const form = useZodForm(registerFormSchema, { name: '', email: '', password: '', confirmPassword: '' })

  const onSubmit = form.handleSubmit(({ name, email, password }) =>
    register.mutate(
      { name, email, password },
      {
        onSuccess: () => {
          toast.success('Conta criada com sucesso.')
          void navigate({ href: safeRedirectPath(search.redirect), replace: true })
        },
        onError: form.applyApiError,
      },
    ),
  )

  return (
    <AuthLayout title="Criar conta" description="Cadastre-se para salvar favoritos, cadastrar carteiras e comprar edições.">
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <FormError message={form.formError} />
        <Field name="name" label="Nome" error={form.errors.name}>
          {(props) => <Input {...props} autoComplete="name" value={form.values.name} onChange={(event) => form.setValue('name', event.target.value)} />}
        </Field>
        <Field name="email" label="E-mail" error={form.errors.email}>
          {(props) => (
            <Input {...props} type="email" autoComplete="email" value={form.values.email} onChange={(event) => form.setValue('email', event.target.value)} />
          )}
        </Field>
        <Field name="password" label="Senha" hint="Mínimo de 8 caracteres, com letras e números." error={form.errors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.values.password}
              onChange={(event) => form.setValue('password', event.target.value)}
            />
          )}
        </Field>
        <Field name="confirmPassword" label="Confirmar senha" error={form.errors.confirmPassword}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.values.confirmPassword}
              onChange={(event) => form.setValue('confirmPassword', event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" disabled={register.isPending}>
          {register.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Criar conta
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Já tem conta?{' '}
        <Link to="/login" search={{ redirect: search.redirect }} className="font-medium text-foreground underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  )
}
