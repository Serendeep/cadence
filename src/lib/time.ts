import type { Penalty, Solve } from './types'

export const DNF = Number.POSITIVE_INFINITY
const PLUS_TWO_MS = 2000

/** Time that counts for statistics: raw time with the penalty applied, Infinity for DNF. */
export function effective(time: number, penalty: Penalty): number {
  if (penalty === 'dnf') return DNF
  return penalty === '+2' ? time + PLUS_TWO_MS : time
}

export const solveValue = (s: Pick<Solve, 'time' | 'penalty'>) => effective(s.time, s.penalty)

/** 12345 -> "12.34", 72345 -> "1:12.34". Truncates like WCA and Stackmat, never rounds up. */
export function formatMs(ms: number | null | undefined, decimals: 2 | 3 = 2): string {
  if (ms == null || Number.isNaN(ms)) return '—'
  if (ms === DNF) return 'DNF'
  const unit = decimals === 3 ? 1 : 10
  const total = Math.floor(ms / unit)
  const frac = total % (decimals === 3 ? 1000 : 100)
  const secs = Math.floor(total / (decimals === 3 ? 1000 : 100))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  const fracStr = String(frac).padStart(decimals, '0')
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${fracStr}`
  return `${s}.${fracStr}`
}

export function formatSolve(s: Pick<Solve, 'time' | 'penalty'>): string {
  if (s.penalty === 'dnf') return 'DNF'
  const t = formatMs(effective(s.time, s.penalty))
  return s.penalty === '+2' ? `${t}+` : t
}

/** Parses "12.34", "1:02.5", "12", "DNF" typed by a user. Returns ms or null when unreadable. */
export function parseTime(input: string): number | null {
  const v = input.trim()
  if (!v) return null
  if (/^dnf$/i.test(v)) return DNF
  const m = /^(?:(\d+):)?(\d+)(?:[.,](\d{1,3}))?$/.exec(v)
  if (!m) return null
  const mins = m[1] ? Number(m[1]) : 0
  const secs = Number(m[2])
  const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0
  return (mins * 60 + secs) * 1000 + frac
}

export function formatDate(epoch: number): string {
  return new Date(epoch).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const MAX_TYPED_MS = 24 * 60 * 60 * 1000

/**
 * A time typed into the timer, read the way csTimer reads it: digits alone fill from the right (1234 is 12.34, 12345 is 1:23.45),
 * "12.34" and "1:02.50" work as written, a trailing + adds two seconds and "DNF" is a DNF. Null when unreadable.
 */
export function parseTyped(input: string): { time: number; penalty: Penalty } | null {
  const v = input.trim().replace(/\s+/g, '')
  if (/^dnf$/i.test(v)) return { time: 0, penalty: 'dnf' }
  const plus = v.endsWith('+')
  const body = plus ? v.slice(0, -1) : v
  let time: number | null
  if (/^\d+$/.test(body)) {
    const d = body.padStart(5, '0')
    time = (Number(d.slice(0, -4)) * 60 + Number(d.slice(-4, -2))) * 1000 + Number(d.slice(-2)) * 10
  } else {
    time = parseTime(body)
  }
  if (time == null || time === DNF || time <= 0 || time >= MAX_TYPED_MS) return null
  return { time, penalty: plus ? '+2' : 'ok' }
}
