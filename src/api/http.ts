/**
 * Axios transport for the REST API.
 *
 * - Sends cookies (session is an HttpOnly cookie handled by the server) and a CSRF header.
 * - Normalizes every failure into ApiError with a stable code, HTTP status and field errors.
 * - Parses successful payloads with the zod contract supplied by each endpoint module.
 * - Notifies the session layer when the server reports an invalid or expired session.
 */
import axios, { type AxiosRequestConfig, isAxiosError, isCancel } from 'axios'
import type { z } from 'zod'
import { apiErrorBodySchema } from './contracts'

export const CSRF_HEADER = 'X-Requested-With'
export const CSRF_HEADER_VALUE = 'jungle-web'
export const DEFAULT_TIMEOUT_MS = 10_000

export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'contract' | 'cancelled'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly code: string
  readonly fieldErrors: Record<string, string>
  readonly details: unknown

  constructor(params: {
    kind: ApiErrorKind
    status: number | null
    code: string
    message: string
    fieldErrors?: Record<string, string>
    details?: unknown
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.kind = params.kind
    this.status = params.status
    this.code = params.code
    this.fieldErrors = params.fieldErrors ?? {}
    this.details = params.details
  }

  get isRetryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true
    return this.status !== null && (this.status >= 500 || this.status === 429)
  }

  get isSessionError(): boolean {
    return this.status === 401
  }
}

type SessionErrorListener = (error: ApiError) => void
const sessionErrorListeners = new Set<SessionErrorListener>()

export function onSessionError(listener: SessionErrorListener): () => void {
  sessionErrorListeners.add(listener)
  return () => sessionErrorListeners.delete(listener)
}

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: DEFAULT_TIMEOUT_MS,
  withCredentials: true,
  headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, Accept: 'application/json' },
})

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isCancel(error)) {
    return new ApiError({ kind: 'cancelled', status: null, code: 'CANCELLED', message: 'Requisição cancelada' })
  }
  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError({
        kind: 'timeout',
        status: null,
        code: 'TIMEOUT',
        message: 'O servidor demorou para responder. Tente novamente.',
      })
    }
    if (!error.response) {
      return new ApiError({
        kind: 'network',
        status: null,
        code: 'NETWORK_ERROR',
        message: 'Não foi possível conectar. Verifique sua conexão e tente novamente.',
      })
    }
    const parsed = apiErrorBodySchema.safeParse(error.response.data)
    const status = error.response.status
    if (parsed.success) {
      return new ApiError({ kind: 'http', status, ...parsed.data.error })
    }
    return new ApiError({
      kind: 'http',
      status,
      code: status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR',
      message: status >= 500 ? 'Serviço indisponível no momento. Tente novamente.' : 'A solicitação não pôde ser concluída.',
    })
  }
  return new ApiError({ kind: 'network', status: null, code: 'UNKNOWN', message: 'Erro inesperado.' })
}

export async function request<TSchema extends z.ZodType>(
  schema: TSchema,
  config: AxiosRequestConfig,
): Promise<z.infer<TSchema>> {
  try {
    const response = await httpClient.request<unknown>(config)
    const parsed = schema.safeParse(response.data)
    if (!parsed.success) {
      throw new ApiError({
        kind: 'contract',
        status: response.status,
        code: 'CONTRACT_MISMATCH',
        message: 'Resposta inesperada do servidor.',
        details: parsed.error.issues,
      })
    }
    return parsed.data
  } catch (error) {
    const apiError = toApiError(error)
    if (apiError.isSessionError) {
      sessionErrorListeners.forEach((listener) => listener(apiError))
    }
    throw apiError
  }
}

export async function requestVoid(config: AxiosRequestConfig): Promise<void> {
  try {
    await httpClient.request(config)
  } catch (error) {
    const apiError = toApiError(error)
    if (apiError.isSessionError) {
      sessionErrorListeners.forEach((listener) => listener(apiError))
    }
    throw apiError
  }
}
