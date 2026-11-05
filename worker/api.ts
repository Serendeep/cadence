import { randomHex, signToken, verifyToken } from './auth'
import { MAX_SYNC_BODY, parseSyncRequest } from './sync'
import type { UserStore } from './userStore'
import { authorizeUrl, CALLBACK_PATH, exchangeCode, fetchProfile } from './wca'

// replaced at build time; only `npm run dev:worker` turns it on, so production bundles never contain the test sign-in
declare const __DEV_LOGIN__: boolean

// must equal the redirect URI registered with the WCA application
const SITE = 'https://timer.serendeep.app'
// the web app is same-origin; the desktop app calls from app://bundle and, in development, from Vite
const ALLOWED_ORIGINS = new Set([SITE, 'app://bundle', 'http://localhost:5173'])
// __Host- makes the browser refuse this cookie from any other subdomain of serendeep.app
const STATE_COOKIE = '__Host-cadence_oauth'
const STATE_MAX_AGE_S = 600
const HEX32 = /^[0-9a-f]{32}$/
type Client = 'web' | 'desktop'

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) } })

const error = (req: Request, status: number, message: string) => json(req, { error: message }, status)

const users = (env: Env) => env.USERS as DurableObjectNamespace<UserStore>

const stateCookie = (value: string, maxAge: number) => `${STATE_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`

interface SignInState {
  client: Client
  /** Random value the web app stored before leaving; it must come back with the token, so a link carrying someone else's token is refused */
  nonce: string
}

/** Where the browser lands after sign-in; the token rides in the fragment, which never reaches a server or its logs. */
function finish(from: SignInState, result: { token: string } | { error: string }): Response {
  const location =
    from.client === 'desktop'
      ? `/auth/desktop#${'token' in result ? `token=${result.token}` : `error=${result.error}`}`
      : `/#/settings?${'token' in result ? `auth=${result.token}&nonce=${from.nonce}` : `auth-error=${result.error}`}`
  return new Response(null, { status: 302, headers: { Location: location, 'Set-Cookie': stateCookie('', 0), 'Cache-Control': 'no-store' } })
}

function login(req: Request, env: Env): Response {
  const params = new URL(req.url).searchParams
  const client: Client = params.get('client') === 'desktop' ? 'desktop' : 'web'
  const nonce = params.get('nonce') ?? ''
  // the desktop app reads the result in its own process, so only the web needs the nonce
  if (client === 'web' && !HEX32.test(nonce)) return new Response('Start signing in from the Settings page in Cadence.', { status: 400 })
  const state = randomHex(16)
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl(env.WCA_APPLICATION_ID, SITE + CALLBACK_PATH, state),
      'Set-Cookie': stateCookie(`${state}.${client}.${client === 'web' ? nonce : '-'}`, STATE_MAX_AGE_S),
      'Cache-Control': 'no-store',
    },
  })
}

async function callback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const cookie = /(?:^|;\s*)__Host-cadence_oauth=([0-9a-f]{32})\.(web|desktop)\.([0-9a-f]{32}|-)/.exec(req.headers.get('Cookie') ?? '')
  const from: SignInState = { client: cookie?.[2] === 'desktop' ? 'desktop' : 'web', nonce: cookie?.[3] ?? '' }
  const code = url.searchParams.get('code')
  // the state must match the cookie set when this browser started signing in, or a third party could plant their own login
  if (!cookie || url.searchParams.get('state') !== cookie[1]) return finish(from, { error: 'expired' })
  if (!code) return finish(from, { error: url.searchParams.get('error') === 'access_denied' ? 'denied' : 'failed' })
  try {
    const access = await exchangeCode(env.WCA_APPLICATION_ID, env.WCA_SECRET, code, SITE + CALLBACK_PATH)
    const profile = await fetchProfile(access)
    const userId = String(profile.id)
    const tokenId = await users(env).getByName(userId).createToken(profile)
    return finish(from, { token: await signToken(env.SESSION_SECRET, userId, tokenId) })
  } catch (e) {
    console.error(JSON.stringify({ source: 'auth', message: e instanceof Error ? e.message : String(e) }))
    return finish(from, { error: 'failed' })
  }
}

async function authenticate(req: Request, env: Env) {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const parsed = token ? await verifyToken(env.SESSION_SECRET, token) : null
  if (!parsed) return null
  const store = users(env).getByName(parsed.userId)
  return (await store.checkToken(parsed.tokenId)) ? { ...parsed, store } : null
}

async function sync(req: Request, store: DurableObjectStub<UserStore>): Promise<Response> {
  // refuse early from the header; the length check after reading catches a missing or false header
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_SYNC_BODY) return error(req, 413, 'Too much at once')
  const text = await req.text()
  if (text.length > MAX_SYNC_BODY) return error(req, 413, 'Too much at once')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return error(req, 400, 'Bad JSON')
  }
  const parsed = parseSyncRequest(body)
  if (!parsed) return error(req, 400, 'Not a sync request')
  const result = await store.sync(parsed.since, parsed.changes)
  return 'error' in result ? error(req, 507, result.error) : json(req, result)
}

async function devLogin(req: Request, env: Env): Promise<Response> {
  const userId = new URL(req.url).searchParams.get('id') ?? '1'
  if (!/^\d{1,6}$/.test(userId)) return error(req, 400, 'id must be a number')
  const tokenId = await users(env).getByName(userId).createToken({ id: Number(userId), wcaId: '2020TEST01', name: `Tester ${userId}`, avatar: null })
  return json(req, { token: await signToken(env.SESSION_SECRET, userId, tokenId) })
}

async function routeApi(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (__DEV_LOGIN__ && pathname === '/api/dev/login') return devLogin(req, env)

  if (pathname === '/api/auth/wca/login' || pathname === CALLBACK_PATH) {
    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
    // separate buckets, so a burst of starts behind a shared address cannot block people finishing sign-in
    if (!(await env.AUTH_LIMIT.limit({ key: `${pathname === CALLBACK_PATH ? 'cb' : 'in'}:${ip}` })).success)
      return new Response('Too many sign-in attempts. Wait a minute.', { status: 429 })
    if (req.method !== 'GET') return error(req, 405, 'Method not allowed')
    return pathname === CALLBACK_PATH ? callback(req, env) : login(req, env)
  }

  const routes: Record<string, string> = { '/api/me': 'GET', '/api/sync': 'POST', '/api/auth/logout': 'POST', '/api/account': 'DELETE' }
  if (!routes[pathname]) return error(req, 404, 'Not found')
  if (req.method !== routes[pathname]) return error(req, 405, 'Method not allowed')
  const auth = await authenticate(req, env)
  if (!auth) return error(req, 401, 'Signed out')
  if (!(await env.SYNC_LIMIT.limit({ key: auth.userId })).success) return error(req, 429, 'Too many requests')

  switch (pathname) {
    case '/api/me':
      return json(req, await auth.store.profile())
    case '/api/sync':
      return sync(req, auth.store)
    case '/api/auth/logout':
      await auth.store.revokeToken(auth.tokenId)
      return json(req, { ok: true })
    default:
      await auth.store.wipe()
      return json(req, { ok: true })
  }
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  try {
    return await routeApi(req, env)
  } catch (e) {
    console.error(JSON.stringify({ source: 'api', path: new URL(req.url).pathname, message: e instanceof Error ? e.message : String(e) }))
    return error(req, 500, 'Something went wrong. Try again.')
  }
}
