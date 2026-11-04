import { cleanLogBatch, MAX_BODY_BYTES } from './log'

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

// the desktop app posts from app://, so the log endpoint accepts any origin; it only ever writes to the log
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

async function handleLog(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })
  const body = await req.text()
  if (body.length > MAX_BODY_BYTES) return new Response('Too large', { status: 413, headers: CORS })
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return new Response('Bad JSON', { status: 400, headers: CORS })
  }
  const batch = cleanLogBatch(parsed)
  if (!batch) return new Response('Not a log batch', { status: 400, headers: CORS })
  const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? ''
  const { entries, ...ctx } = batch
  // one line per entry so Workers Logs can filter on any field
  for (const e of entries) {
    const line = JSON.stringify({ source: 'client', ...ctx, country, ...e })
    if (e.level === 'error') console.error(line)
    else if (e.level === 'warn') console.warn(line)
    else console.log(line)
  }
  return new Response(null, { status: 204, headers: CORS })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url)
    if (pathname === '/api/log') return handleLog(req)
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })
    return env.ASSETS.fetch(req)
  },
}
