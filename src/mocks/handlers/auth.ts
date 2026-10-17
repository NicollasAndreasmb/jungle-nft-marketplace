/**
 * Mock handlers for registration, login (with attempt limiting), session lookup, logout and
 * realtime ticket issuing. Sessions are opaque HttpOnly cookies; only token hashes are stored.
 */
import { HttpResponse } from 'msw'
import { loginRequestSchema, registerRequestSchema } from '@/api/contracts'
import { hashPassword, randomId, sha256, verifyPassword } from '../crypto'
import { db, nowIso, persist } from '../db'
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  mergeGuestCart,
  requireSession,
  resolveSession,
  toUser,
} from '../domain'
import { HttpProblem, jsonWithCookies, parseBody, route } from '../http'
import { disconnectRevokedConnections, disconnectUserConnections, issueRealtimeTicket } from '../realtime'

const MAX_FAILED_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000
const failedAttempts = new Map<string, number[]>()

function assertNotRateLimited(email: string): void {
  const recent = (failedAttempts.get(email) ?? []).filter((timestamp) => Date.now() - timestamp < ATTEMPT_WINDOW_MS)
  failedAttempts.set(email, recent)
  if (recent.length >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((ATTEMPT_WINDOW_MS - (Date.now() - (recent[0] ?? Date.now()))) / 1000)
    throw new HttpProblem(429, 'RATE_LIMITED', 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', {
      headers: { 'Retry-After': String(retryAfterSeconds) },
    })
  }
}

const DUMMY_SALT = '00000000000000000000000000000000'
const DUMMY_HASH = '0'.repeat(64)

async function revokePreviousSession(cookies: Record<string, string>): Promise<void> {
  const previousToken = cookies[SESSION_COOKIE]
  if (!previousToken) return
  const previousHash = await sha256(previousToken)
  db().sessions = db().sessions.filter((session) => session.tokenHash !== previousHash)
  persist()
  disconnectRevokedConnections()
}

function usernameFromEmail(email: string): string {
  const base = (email.split('@')[0] ?? 'colecionador').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 18) || 'colecionador'
  let candidate = base.length >= 3 ? base : `${base}_nft`
  let suffix = 1
  while (db().users.some((user) => user.username === candidate)) {
    candidate = `${base.slice(0, 18)}_${suffix}`
    suffix += 1
  }
  return candidate
}

export const authHandlers = [
  route('post', '/auth/register', async ({ request, cookies }) => {
    const body = await parseBody(request, registerRequestSchema)
    if (db().users.some((user) => user.email === body.email)) {
      throw new HttpProblem(409, 'EMAIL_TAKEN', 'Este e-mail já está cadastrado.', {
        fieldErrors: { email: 'Este e-mail já está cadastrado. Entre ou use outro e-mail.' },
      })
    }
    const { hash, salt } = await hashPassword(body.password)
    const user = {
      id: randomId('user'),
      name: body.name,
      email: body.email,
      username: usernameFromEmail(body.email),
      bio: '',
      avatarUrl: null,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: nowIso(),
    }
    db().users.push(user)
    db().favorites[user.id] = []
    persist()
    await revokePreviousSession(cookies)
    mergeGuestCart(cookies, user.id)
    const session = await createSession(user.id)
    return jsonWithCookies({ user: toUser(user), expiresAt: session.expiresAt }, [session.cookie], { status: 201 })
  }),

  route('post', '/auth/login', async ({ request, cookies }) => {
    const body = await parseBody(request, loginRequestSchema)
    assertNotRateLimited(body.email)
    const user = db().users.find((candidate) => candidate.email === body.email)
    const valid = user
      ? await verifyPassword(body.password, user.passwordHash, user.passwordSalt)
      : await verifyPassword(body.password, DUMMY_HASH, DUMMY_SALT).then(() => false)
    if (!user || !valid) {
      failedAttempts.set(body.email, [...(failedAttempts.get(body.email) ?? []), Date.now()])
      throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
    }
    failedAttempts.delete(body.email)
    await revokePreviousSession(cookies)
    mergeGuestCart(cookies, user.id)
    const session = await createSession(user.id)
    return jsonWithCookies({ user: toUser(user), expiresAt: session.expiresAt }, [session.cookie])
  }),

  route('get', '/auth/session', async ({ cookies }) => {
    const session = await resolveSession(cookies)
    if (!session) return HttpResponse.json({ user: null, expiresAt: null })
    const record = db().sessions.find((candidate) => candidate.tokenHash === session.tokenHash)
    return HttpResponse.json({ user: toUser(session.user), expiresAt: record?.expiresAt ?? nowIso() })
  }),

  route('post', '/auth/logout', async ({ cookies }) => {
    const session = await resolveSession(cookies).catch(() => null)
    if (session) {
      db().sessions = db().sessions.filter((candidate) => candidate.tokenHash !== session.tokenHash)
      db().walletSessions = db().walletSessions.filter((candidate) => candidate.userId !== session.user.id)
      persist()
      disconnectUserConnections(session.user.id)
    }
    return jsonWithCookies(null, [clearSessionCookie()], { status: 200 })
  }),

  route('post', '/realtime/ticket', async ({ cookies }) => {
    const session = await requireSession(cookies)
    return HttpResponse.json(issueRealtimeTicket(session.user.id, session.tokenHash))
  }),
]
