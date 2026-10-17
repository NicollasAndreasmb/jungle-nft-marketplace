/**
 * Minimal controlled form state validated by the same zod schemas the API uses.
 * Tracks values, client and server field errors, a form-level error, and focuses the first
 * invalid field on failed submission.
 */
import { type FormEvent, useCallback, useState } from 'react'
import type { z } from 'zod'
import { ApiError } from '@/api/http'

type Values<TSchema extends z.ZodObject> = { [K in keyof z.input<TSchema>]: z.input<TSchema>[K] }

export function useZodForm<TSchema extends z.ZodObject>(schema: TSchema, initialValues: Values<TSchema>) {
  const [values, setValues] = useState<Values<TSchema>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const setValue = useCallback(<K extends keyof Values<TSchema>>(key: K, value: Values<TSchema>[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key as string]) return current
      const next = { ...current }
      delete next[key as string]
      return next
    })
  }, [])

  const focusField = (name: string | undefined) => {
    if (!name) return
    window.requestAnimationFrame(() => document.getElementById(`field-${name}`)?.focus())
  }

  const applyApiError = useCallback((error: unknown) => {
    if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
      setErrors(error.fieldErrors)
      setFormError(null)
      focusField(Object.keys(error.fieldErrors)[0])
      return
    }
    setFormError(error instanceof ApiError ? error.message : 'Não foi possível concluir. Tente novamente.')
  }, [])

  const handleSubmit = useCallback(
    (onValid: (data: z.output<TSchema>) => void | Promise<void>) => (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setFormError(null)
      const result = schema.safeParse(values)
      if (!result.success) {
        const nextErrors: Record<string, string> = {}
        for (const issue of result.error.issues) {
          const key = issue.path.join('.')
          nextErrors[key] ??= issue.message
        }
        setErrors(nextErrors)
        focusField(Object.keys(nextErrors)[0])
        return
      }
      setErrors({})
      void onValid(result.data)
    },
    [schema, values],
  )

  return { values, setValues, setValue, errors, formError, setFormError, applyApiError, handleSubmit }
}
