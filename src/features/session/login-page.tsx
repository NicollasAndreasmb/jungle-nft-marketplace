/**
 * Login: validated credentials form, API error handling (invalid credentials, rate limiting),
 * expired-session notice and safe return to the previous flow.
 */
import { getRouteApi, Link } from '@tanstack/react-router'
import { Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { loginRequestSchema } from '@/api/contracts'
import { Field, FormError } from '@/components/form/field'
import { useZodForm } from '@/components/form/use-zod-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { useDocumentTitle } from '@/lib/use-document-title'
import { AuthLayout } from './auth-layout'
import { useLogin } from './session-queries'

const routeApi = getRouteApi('/login')

export function LoginPage() {
  useDocumentTitle('Entrar')
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const login = useLogin()
  const form = useZodForm(loginRequestSchema, { email: '', password: '' })

  const onSubmit = form.handleSubmit((data) =>
    login.mutate(data, {
      onSuccess: (session) => {
        toast.success(`Olá, ${session.user.name.split(' ')[0]}!`)
        void navigate({ href: safeRedirectPath(search.redirect), replace: true })
      },
      onError: form.applyApiError,
    }),
  )

  return (
    <AuthLayout title="Entrar" description="Acesse sua conta para favoritar, pagar e acompanhar pedidos.">
      {search.reason === 'expired' ? (
        <p role="status" className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <Info className="size-4 text-warning" aria-hidden="true" /> Sua sessão expirou. Entre novamente para continuar de onde parou.
        </p>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <FormError message={form.formError} />
        <Field name="email" label="E-mail" error={form.errors.email}>
          {(props) => (
            <Input {...props} type="email" autoComplete="email" value={form.values.email} onChange={(event) => form.setValue('email', event.target.value)} />
          )}
        </Field>
        <Field name="password" label="Senha" error={form.errors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              value={form.values.password}
              onChange={(event) => form.setValue('password', event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Entrar
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" search={{ redirect: search.redirect }} className="font-medium text-foreground underline underline-offset-4">
          Criar conta
        </Link>
      </p>
      {import.meta.env.VITE_ENABLE_MOCKS === 'true' ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Ambiente de demonstração: use <strong>ana@jungle.test</strong> ou <strong>bruno@jungle.test</strong> com a senha{' '}
          <strong>Jungle@2026</strong>.
        </p>
      ) : null}
    </AuthLayout>
  )
}
