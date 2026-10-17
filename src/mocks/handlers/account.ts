/**
 * Mock handlers for the collector account. Every route requires a session and only touches
 * records owned by that session's user (lookups are scoped by userId, so foreign ids yield 404).
 * Covers favorites, profile data, avatar upload (type/size/magic-byte checks), password change,
 * wallets (primary/secondary slots) and simulated wallet connection sessions.
 */
import { HttpResponse } from 'msw'
import {
  AVATAR_MAX_BYTES,
  connectWalletRequestSchema,
  createWalletRequestSchema,
  passwordChangeRequestSchema,
  profileUpdateRequestSchema,
  walletInputSchema,
} from '@/api/contracts'
import { hashPassword, randomId, verifyPassword } from '../crypto'
import { db, nowIso, persist } from '../db'
import { findNft, requireSession, toNftSummary, toUser, toWallet } from '../domain'
import { HttpProblem, parseBody, route } from '../http'
import { disconnectRevokedConnections } from '../realtime'
import { getScenario } from '../scenarios'

const IMAGE_SIGNATURES: Array<{ mime: string; matches: (bytes: Uint8Array) => boolean }> = [
  { mime: 'image/png', matches: (bytes) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) },
  { mime: 'image/jpeg', matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  {
    mime: 'image/webp',
    matches: (bytes) =>
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP',
  },
]

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function walletOf(userId: string, walletId: string) {
  const wallet = db().wallets.find((candidate) => candidate.id === walletId && candidate.userId === userId)
  if (!wallet) throw new HttpProblem(404, 'WALLET_NOT_FOUND', 'Carteira não encontrada.')
  return wallet
}

function assertUniqueAddress(userId: string, address: string, exceptWalletId?: string): void {
  const duplicate = db().wallets.some(
    (wallet) => wallet.userId === userId && wallet.id !== exceptWalletId && wallet.address.toLowerCase() === address.toLowerCase(),
  )
  if (duplicate) {
    throw new HttpProblem(409, 'WALLET_DUPLICATE', 'Este endereço já está cadastrado em outra carteira.', {
      fieldErrors: { address: 'Este endereço já está cadastrado na sua outra carteira.' },
    })
  }
}

export const accountHandlers = [
  route('get', '/favorites', async ({ cookies }) => {
    const { user } = await requireSession(cookies)
    const nftIds = db().favorites[user.id] ?? []
    const items = nftIds
      .map((nftId) => db().nfts.find((nft) => nft.id === nftId))
      .filter((nft) => nft !== undefined)
      .map(toNftSummary)
    return HttpResponse.json({ nftIds, items })
  }),

  route('put', '/favorites/:nftId', async ({ cookies, params }) => {
    const { user } = await requireSession(cookies)
    const nft = findNft(params.nftId ?? '')
    const current = db().favorites[user.id] ?? []
    if (!current.includes(nft.id)) db().favorites[user.id] = [nft.id, ...current]
    persist()
    return new HttpResponse(null, { status: 204 })
  }),

  route('delete', '/favorites/:nftId', async ({ cookies, params }) => {
    const { user } = await requireSession(cookies)
    db().favorites[user.id] = (db().favorites[user.id] ?? []).filter((nftId) => nftId !== params.nftId)
    persist()
    return new HttpResponse(null, { status: 204 })
  }),

  route('get', '/profile', async ({ cookies }) => {
    const { user } = await requireSession(cookies)
    return HttpResponse.json(toUser(user))
  }),

  route('patch', '/profile', async ({ request, cookies }) => {
    const { user } = await requireSession(cookies)
    const body = await parseBody(request, profileUpdateRequestSchema)
    const fieldErrors: Record<string, string> = {}
    if (db().users.some((candidate) => candidate.id !== user.id && candidate.email === body.email)) {
      fieldErrors.email = 'Este e-mail já está em uso por outra conta.'
    }
    if (db().users.some((candidate) => candidate.id !== user.id && candidate.username === body.username)) {
      fieldErrors.username = 'Este nome de usuário já está em uso.'
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new HttpProblem(409, 'PROFILE_CONFLICT', 'Alguns dados já estão em uso.', { fieldErrors })
    }
    user.name = body.name
    user.username = body.username
    user.email = body.email
    user.bio = body.bio
    persist()
    return HttpResponse.json(toUser(user))
  }),

  route('post', '/profile/avatar', async ({ request, cookies }) => {
    const { user } = await requireSession(cookies)
    let file: FormDataEntryValue | null
    try {
      file = (await request.formData()).get('avatar')
    } catch {
      throw new HttpProblem(400, 'BAD_REQUEST', 'Envie a imagem como multipart/form-data.')
    }
    if (!(file instanceof Blob)) {
      throw new HttpProblem(422, 'VALIDATION_ERROR', 'Selecione uma imagem.', { fieldErrors: { avatar: 'Selecione uma imagem.' } })
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new HttpProblem(422, 'AVATAR_TOO_LARGE', 'Imagem muito grande.', {
        fieldErrors: { avatar: `A imagem deve ter no máximo ${AVATAR_MAX_BYTES / 1024} KB.` },
      })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const signature = IMAGE_SIGNATURES.find((candidate) => candidate.matches(bytes))
    if (!signature) {
      throw new HttpProblem(422, 'AVATAR_INVALID_TYPE', 'Formato não suportado.', {
        fieldErrors: { avatar: 'Use uma imagem PNG, JPEG ou WebP.' },
      })
    }
    user.avatarUrl = `data:${signature.mime};base64,${toBase64(bytes)}`
    persist()
    return HttpResponse.json({ avatarUrl: user.avatarUrl })
  }),

  route('delete', '/profile/avatar', async ({ cookies }) => {
    const { user } = await requireSession(cookies)
    user.avatarUrl = null
    persist()
    return HttpResponse.json({ avatarUrl: null })
  }),

  route('put', '/profile/password', async ({ request, cookies }) => {
    const { user, tokenHash } = await requireSession(cookies)
    const body = await parseBody(request, passwordChangeRequestSchema)
    if (!(await verifyPassword(body.currentPassword, user.passwordHash, user.passwordSalt))) {
      throw new HttpProblem(422, 'INVALID_CURRENT_PASSWORD', 'Senha atual incorreta.', {
        fieldErrors: { currentPassword: 'A senha atual está incorreta.' },
      })
    }
    if (body.currentPassword === body.newPassword) {
      throw new HttpProblem(422, 'VALIDATION_ERROR', 'Escolha uma senha diferente da atual.', {
        fieldErrors: { newPassword: 'A nova senha deve ser diferente da atual.' },
      })
    }
    const { hash, salt } = await hashPassword(body.newPassword)
    user.passwordHash = hash
    user.passwordSalt = salt
    db().sessions = db().sessions.filter((session) => session.userId !== user.id || session.tokenHash === tokenHash)
    persist()
    disconnectRevokedConnections()
    return new HttpResponse(null, { status: 204 })
  }),

  route('get', '/wallets', async ({ cookies }) => {
    const { user } = await requireSession(cookies)
    const wallets = db()
      .wallets.filter((wallet) => wallet.userId === user.id)
      .sort((left, right) => left.slot.localeCompare(right.slot))
      .map(toWallet)
    return HttpResponse.json(wallets)
  }),

  route('post', '/wallets', async ({ request, cookies }) => {
    const { user } = await requireSession(cookies)
    const body = await parseBody(request, createWalletRequestSchema)
    if (db().wallets.some((wallet) => wallet.userId === user.id && wallet.slot === body.slot)) {
      throw new HttpProblem(409, 'WALLET_SLOT_TAKEN', 'Já existe uma carteira cadastrada nesta posição.')
    }
    assertUniqueAddress(user.id, body.address)
    const wallet = {
      id: randomId('wallet'),
      userId: user.id,
      slot: body.slot,
      label: body.label,
      address: body.address,
      provider: body.provider,
      networks: body.networks,
      updatedAt: nowIso(),
    }
    db().wallets.push(wallet)
    persist()
    return HttpResponse.json(toWallet(wallet), { status: 201 })
  }),

  route('patch', '/wallets/:walletId', async ({ request, cookies, params }) => {
    const { user } = await requireSession(cookies)
    const wallet = walletOf(user.id, params.walletId ?? '')
    const body = await parseBody(request, walletInputSchema)
    assertUniqueAddress(user.id, body.address, wallet.id)
    wallet.label = body.label
    wallet.address = body.address
    wallet.provider = body.provider
    wallet.networks = body.networks
    wallet.updatedAt = nowIso()
    db().walletSessions = db().walletSessions.filter((session) => session.walletId !== wallet.id)
    persist()
    return HttpResponse.json(toWallet(wallet))
  }),

  route('post', '/wallets/:walletId/connect', async ({ request, cookies, params }) => {
    const { user } = await requireSession(cookies)
    const wallet = walletOf(user.id, params.walletId ?? '')
    const body = await parseBody(request, connectWalletRequestSchema)
    if (!wallet.networks.includes(body.network)) {
      throw new HttpProblem(422, 'NETWORK_UNSUPPORTED', 'Esta carteira não está habilitada para a rede selecionada.')
    }
    if (getScenario().flags.walletRejects) {
      throw new HttpProblem(409, 'WALLET_REJECTED', 'A conexão foi recusada na carteira.')
    }
    db().walletSessions = db().walletSessions.filter((session) => session.userId !== user.id)
    const session = { id: randomId('wsess'), userId: user.id, walletId: wallet.id, network: body.network, connectedAt: nowIso() }
    db().walletSessions.push(session)
    persist()
    return HttpResponse.json({ id: session.id, walletId: wallet.id, network: session.network, status: 'connected', connectedAt: session.connectedAt })
  }),

  route('delete', '/wallet-sessions/:sessionId', async ({ cookies, params }) => {
    const { user } = await requireSession(cookies)
    db().walletSessions = db().walletSessions.filter((session) => !(session.id === params.sessionId && session.userId === user.id))
    persist()
    return new HttpResponse(null, { status: 204 })
  }),
]
