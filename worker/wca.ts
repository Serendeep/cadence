const WCA = 'https://www.worldcubeassociation.org'
export const CALLBACK_PATH = '/api/auth/wca/callback'

export interface WcaProfile {
  /** WCA website account id; every account has one, competitors or not */
  id: number
  /** Competitor id like 2016SING01, if the account has competed */
  wcaId: string | null
  name: string
  avatar: string | null
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'public', state })
  return `${WCA}/oauth/authorize?${q}`
}

/** Trades the one-time code for a WCA access token; it is used once, to read the profile, and never stored. */
export async function exchangeCode(clientId: string, secret: string, code: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${WCA}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: secret }),
  })
  if (!res.ok) throw new Error(`WCA token exchange failed: ${res.status}`)
  const json: unknown = await res.json()
  const token = (json as { access_token?: unknown }).access_token
  if (typeof token !== 'string') throw new Error('WCA token exchange returned no token')
  return token
}

export function parseProfile(json: unknown): WcaProfile | null {
  const me = (json as { me?: Record<string, unknown> } | null)?.me
  if (!me || typeof me.id !== 'number' || typeof me.name !== 'string') return null
  const avatar = me.avatar as { thumb_url?: unknown } | undefined
  return {
    id: me.id,
    wcaId: typeof me.wca_id === 'string' ? me.wca_id : null,
    name: me.name,
    avatar: typeof avatar?.thumb_url === 'string' ? avatar.thumb_url : null,
  }
}

export async function fetchProfile(accessToken: string): Promise<WcaProfile> {
  const res = await fetch(`${WCA}/api/v0/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`WCA profile request failed: ${res.status}`)
  const profile = parseProfile(await res.json())
  if (!profile) throw new Error('WCA profile was not understood')
  return profile
}
