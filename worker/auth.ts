const enc = new TextEncoder()

const toB64url = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

const hmacKey = (secret: string) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export const randomHex = (bytes: number): string => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

const USER_ID = /^\d{1,12}$/
const TOKEN_ID = /^[0-9a-f]{32}$/

/** A sign-in token: `<WCA user id>.<token id>.<HMAC>`. The token id is checked against the user's store, so tokens can be revoked. */
export async function signToken(secret: string, userId: string, tokenId: string): Promise<string> {
  const body = `${userId}.${tokenId}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body))
  return `${body}.${toB64url(sig)}`
}

export async function verifyToken(secret: string, token: string): Promise<{ userId: string; tokenId: string } | null> {
  const [userId, tokenId, sig, ...rest] = token.split('.')
  if (rest.length || !USER_ID.test(userId ?? '') || !TOKEN_ID.test(tokenId ?? '') || !sig) return null
  const bytes = fromB64url(sig)
  if (!bytes) return null
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, enc.encode(`${userId}.${tokenId}`))
  return ok ? { userId, tokenId } : null
}
