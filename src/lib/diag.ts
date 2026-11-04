/**
 * Anonymous diagnostics: device connection steps, warnings and errors go to /api/log so field bugs
 * (one tablet's Bluetooth stack, say) can be read in Workers Logs. No solves, times or account data.
 */
const ENDPOINT = 'https://timer.serendeep.app/api/log'
const FLUSH_MS = 5000
const MAX_QUEUE = 50
const MAX_DATA = 1000

type Level = 'info' | 'warn' | 'error'
interface Entry {
  t: number
  level: Level
  event: string
  data?: string
}

const session = Math.random().toString(36).slice(2, 10)
let queue: Entry[] = []
let isEnabled = () => false

function describe(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Records one diagnostic event; `data` values are stringified and truncated. */
export function diag(event: string, data?: Record<string, unknown> | unknown, level: Level = 'info'): void {
  if (!isEnabled() || queue.length >= MAX_QUEUE) return
  const text = data === undefined ? undefined : describe(data).slice(0, MAX_DATA)
  queue = [...queue, { t: Math.round(performance.now()), level, event, ...(text ? { data: text } : {}) }]
}

function platform(): string {
  if ('desktop' in window) return 'desktop'
  return window.matchMedia('(display-mode: standalone)').matches ? 'pwa' : 'web'
}

function flush(): void {
  if (!queue.length) return
  const body = JSON.stringify({ session, app: __APP_VERSION__, platform: platform(), ua: navigator.userAgent, entries: queue })
  queue = []
  // text/plain keeps this a simple request, so no CORS preflight from app:// or other origins
  const blob = new Blob([body], { type: 'text/plain' })
  if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
    fetch(ENDPOINT, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => undefined)
  }
}

/** Starts capturing console warnings, errors and crashes; `enabled` is read on every event so the Settings switch applies at once. */
export function startDiagnostics(enabled: () => boolean): void {
  // local development stays off the production log
  if (import.meta.env.DEV) return
  isEnabled = enabled
  for (const level of ['warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      diag(`console.${level}`, args.map(describe).join(' '), level)
    }
  }
  window.addEventListener('error', (e) => diag('window.error', e.error ?? e.message, 'error'))
  window.addEventListener('unhandledrejection', (e) => diag('unhandled.rejection', e.reason, 'error'))
  window.setInterval(flush, FLUSH_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  diag('app.start', { screen: `${screen.width}x${screen.height}`, bluetooth: 'bluetooth' in navigator })
}
