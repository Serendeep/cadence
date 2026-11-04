/** Shape the app posts to /api/log; everything is re-validated here because the endpoint is public. */
export interface LogEntry {
  t: number
  level: 'info' | 'warn' | 'error'
  event: string
  data?: string
}

export interface LogBatch {
  session: string
  app: string
  platform: string
  ua: string
  entries: LogEntry[]
}

export const MAX_BODY_BYTES = 32_768
const MAX_ENTRIES = 50
const MAX_TEXT = 300
const MAX_DATA = 1_000
const LEVELS = new Set(['info', 'warn', 'error'])

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

/** Returns a bounded, well-typed batch, or null when the payload is not a log batch at all. */
export function cleanLogBatch(raw: unknown): LogBatch | null {
  if (typeof raw !== 'object' || raw === null) return null
  const src = raw as Record<string, unknown>
  if (!Array.isArray(src.entries)) return null
  const entries = src.entries.slice(0, MAX_ENTRIES).flatMap((e): LogEntry[] => {
    if (typeof e !== 'object' || e === null) return []
    const x = e as Record<string, unknown>
    const event = text(x.event, MAX_TEXT)
    if (!event) return []
    const level = LEVELS.has(x.level as string) ? (x.level as LogEntry['level']) : 'info'
    const t = typeof x.t === 'number' && Number.isFinite(x.t) ? x.t : 0
    const data = text(x.data, MAX_DATA)
    return [{ t, level, event, ...(data ? { data } : {}) }]
  })
  if (!entries.length) return null
  return {
    session: text(src.session, 40),
    app: text(src.app, 40),
    platform: text(src.platform, 20),
    ua: text(src.ua, MAX_TEXT),
    entries,
  }
}
