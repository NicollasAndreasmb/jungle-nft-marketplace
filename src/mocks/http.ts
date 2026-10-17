/**
 * Shared plumbing for the mock REST handlers: route wrapper (latency, fault injection, CSRF check,
 * uniform error envelope), request body validation and cookie serialization.
 */
import { delay, http, HttpResponse } from 'msw'
import type { z } from 'zod'
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@/api/http'
import { latencyFor, takeFault } from './scenarios'

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class HttpProblem extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string> | undefined
  readonly details: unknown
  readonly headers: Record<string, string> | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { fieldErrors?: Record<string, string>; details?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = extra.fieldErrors
    this.details = extra.details
    this.headers = extra.headers
  }
}

export function problemResponse(problem: HttpProblem): Response {
  return HttpResponse.json(
    {
      error: {
        code: problem.code,
        message: problem.message,
        ...(problem.fieldErrors ? { fieldErrors: problem.fieldErrors } : {}),
        ...(problem.details !== undefined ? { details: problem.details } : {}),
      },
    },
    { status: problem.status, headers: problem.headers },
  )
}

const FAULT_MESSAGES: Record<number, [string, string]> = {
  400: ['BAD_REQUEST', 'Requisição inválida.'],
  401: ['UNAUTHENTICATED', 'Sessão inválida. Entre novamente.'],
  403: ['FORBIDDEN', 'Você não tem permissão para acessar este recurso.'],
  404: ['NOT_FOUND', 'Recurso não encontrado.'],
  409: ['CONFLICT', 'Conflito ao processar a solicitação.'],
  422: ['VALIDATION_ERROR', 'Dados inválidos.'],
  429: ['RATE_LIMITED', 'Muitas tentativas. Aguarde e tente novamente.'],
  500: ['INTERNAL_ERROR', 'Erro interno do servidor.'],
  502: ['BAD_GATEWAY', 'Serviço temporariamente indisponível.'],
  503: ['SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.'],
}

export interface RouteContext {
  request: Request
  url: URL
  params: Record<string, string>
  cookies: Record<string, string>
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

export function route(method: Method, path: string, resolver: (context: RouteContext) => Promise<Response> | Response) {
  return http[method](`${API_BASE}${path}`, async ({ request, params, cookies }) => {
    const url = new URL(request.url)
    await delay(latencyFor(url))

    const fault = takeFault(method.toUpperCase(), url.pathname)
    if (fault === 'network') return HttpResponse.error()
    if (fault === 'timeout') {
      await delay(60_000)
      return HttpResponse.error()
    }
    if (typeof fault === 'number') {
      const [code, message] = FAULT_MESSAGES[fault] ?? ['HTTP_ERROR', 'Falha simulada.']
      return problemResponse(new HttpProblem(fault, code, message))
    }

    if (method !== 'get' && request.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      return problemResponse(new HttpProblem(403, 'CSRF_REJECTED', 'Requisição rejeitada.'))
    }

    const normalizedParams = Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? String(value[0]) : String(value)]),
    )

    try {
      return await resolver({ request, url, params: normalizedParams, cookies })
    } catch (error) {
      if (error instanceof HttpProblem) return problemResponse(error)
      console.error('[mocks] Unhandled handler error', error)
      return problemResponse(new HttpProblem(500, 'INTERNAL_ERROR', 'Erro interno do servidor.'))
    }
  })
}

export async function parseBody<TSchema extends z.ZodType>(request: Request, schema: TSchema): Promise<z.infer<TSchema>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HttpProblem(400, 'BAD_REQUEST', 'Corpo da requisição inválido.')
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'form'
      fieldErrors[key] ??= issue.message
    }
    throw new HttpProblem(422, 'VALIDATION_ERROR', 'Revise os campos destacados.', { fieldErrors })
  }
  return result.data
}

export function serializeCookie(name: string, value: string, options: { maxAgeSeconds?: number } = {}): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  const maxAge = options.maxAgeSeconds !== undefined ? `; Max-Age=${options.maxAgeSeconds}` : ''
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict${secure}${maxAge}`
}

export function jsonWithCookies(body: unknown, cookies: string[], init: { status?: number } = {}): Response {
  const headers = new Headers()
  cookies.forEach((cookie) => headers.append('Set-Cookie', cookie))
  return HttpResponse.json(body as Record<string, unknown>, { status: init.status ?? 200, headers })
}
