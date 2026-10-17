import { ApiError } from '@/api/http'

export function errorMessage(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (error instanceof ApiError) return error.message
  return fallback
}
