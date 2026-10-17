/**
 * Checkout step 1: collector data, validated with the same schema the API enforces and saved as a
 * tab-scoped draft so it survives refreshes and session renewal.
 */
import { type Collector, collectorSchema } from '@/api/contracts'
import { Field } from '@/components/form/field'
import { useZodForm } from '@/components/form/use-zod-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CollectorStep({
  initial,
  onDraftChange,
  onSubmit,
}: {
  initial: Partial<Collector>
  onDraftChange: (draft: Partial<Collector>) => void
  onSubmit: (collector: Collector) => void
}) {
  const form = useZodForm(collectorSchema, {
    fullName: initial.fullName ?? '',
    email: initial.email ?? '',
    country: initial.country ?? 'Brasil',
    displayName: initial.displayName ?? '',
  })

  const set = (key: keyof Collector, value: string) => {
    form.setValue(key, value)
    onDraftChange({ ...form.values, [key]: value })
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5" aria-labelledby="collector-title">
      <h2 id="collector-title" className="text-xl font-semibold">
        Dados do colecionador
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="fullName" label="Nome completo" error={form.errors.fullName}>
          {(props) => <Input {...props} autoComplete="name" value={form.values.fullName} onChange={(event) => set('fullName', event.target.value)} />}
        </Field>
        <Field name="email" label="E-mail para o recibo" error={form.errors.email}>
          {(props) => (
            <Input {...props} type="email" autoComplete="email" value={form.values.email} onChange={(event) => set('email', event.target.value)} />
          )}
        </Field>
        <Field name="displayName" label="Nome no certificado" hint="Aparece no certificado de autenticidade." error={form.errors.displayName}>
          {(props) => <Input {...props} value={form.values.displayName} onChange={(event) => set('displayName', event.target.value)} />}
        </Field>
        <Field name="country" label="País de residência" error={form.errors.country}>
          {(props) => (
            <Input {...props} autoComplete="country-name" value={form.values.country} onChange={(event) => set('country', event.target.value)} />
          )}
        </Field>
      </div>
      <div>
        <Button type="submit" size="lg">
          Continuar para carteira
        </Button>
      </div>
    </form>
  )
}
