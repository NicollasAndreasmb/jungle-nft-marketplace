/**
 * Crypto helpers for the mock server: random identifiers, opaque tokens, SHA-256 digests and
 * PBKDF2-SHA256 password hashing via Web Crypto (no plaintext password is ever stored).
 */

const PBKDF2_ITERATIONS = 120_000
const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

export function randomToken(byteLength = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomToken(8)}`
}

export async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return toHex(bits)
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  return { hash: await derive(password, salt), salt: toHex(salt) }
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const candidate = await derive(password, fromHex(salt))
  if (candidate.length !== hash.length) return false
  let difference = 0
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ hash.charCodeAt(index)
  }
  return difference === 0
}
