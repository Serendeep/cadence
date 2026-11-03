import { DNF } from './time'

/** WCA-style average of the last n values: trims ceil(5%) from each end; DNF if more DNFs than trimmed. */
export function averageOf(values: readonly number[], n: number): number | null {
  if (n < 3 || values.length < n) return null
  return trimmedMean(values.slice(-n))
}

export function trimmedMean(window: readonly number[]): number {
  const n = window.length
  const trim = Math.ceil(n * 0.05)
  const sorted = [...window].sort((a, b) => a - b)
  const kept = sorted.slice(trim, n - trim)
  if (kept.some((v) => v === DNF)) return DNF
  return kept.reduce((a, b) => a + b, 0) / kept.length
}

/** Plain mean of the last n (used for mo3); DNF if any is DNF. */
export function meanOf(values: readonly number[], n: number): number | null {
  if (values.length < n) return null
  const w = values.slice(-n)
  if (w.some((v) => v === DNF)) return DNF
  return w.reduce((a, b) => a + b, 0) / n
}

/** Rolling aoN for every index; null until n solves exist. */
export function rollingAverage(values: readonly number[], n: number): (number | null)[] {
  return values.map((_, i) => (i + 1 < n ? null : trimmedMean(values.slice(i + 1 - n, i + 1))))
}

export function best(values: readonly (number | null)[]): number | null {
  let b: number | null = null
  for (const v of values) if (v != null && (b == null || v < b)) b = v
  return b
}

export function worst(values: readonly number[]): number | null {
  return values.length ? Math.max(...values) : null
}

/** Mean of finished solves only (DNFs excluded), like cstimer's session mean. */
export function mean(values: readonly number[]): number | null {
  const ok = values.filter((v) => v !== DNF)
  return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

export function stdDev(values: readonly number[]): number | null {
  const ok = values.filter((v) => v !== DNF)
  if (ok.length < 2) return null
  const m = ok.reduce((a, b) => a + b, 0) / ok.length
  return Math.sqrt(ok.reduce((a, v) => a + (v - m) ** 2, 0) / (ok.length - 1))
}

export const AVERAGE_SIZES = [5, 12, 50, 100, 1000] as const

export interface SessionStats {
  count: number
  dnf: number
  mean: number | null
  sd: number | null
  best: number | null
  worst: number | null
  mo3: number | null
  current: Record<number, number | null>
  bestAvg: Record<number, number | null>
}

export function sessionStats(values: readonly number[]): SessionStats {
  const current: Record<number, number | null> = {}
  const bestAvg: Record<number, number | null> = {}
  for (const n of AVERAGE_SIZES) {
    current[n] = averageOf(values, n)
    // shortcut: full rolling scan is O(N·n log n); skip ao1000 history above 20k solves
    bestAvg[n] = values.length >= n && !(n === 1000 && values.length > 20000) ? best(rollingAverage(values, n)) : null
  }
  const finished = values.filter((v) => v !== DNF)
  return {
    count: values.length,
    dnf: values.length - finished.length,
    mean: mean(values),
    sd: stdDev(values),
    best: best(finished),
    worst: worst(finished),
    mo3: meanOf(values, 3),
    current,
    bestAvg,
  }
}

/** Equal-width histogram over finished solves. Bin width in ms picked from the spread. */
export function histogram(values: readonly number[], bins = 16): { from: number; to: number; count: number }[] {
  const ok = values.filter((v) => v !== DNF)
  if (!ok.length) return []
  const lo = Math.min(...ok)
  const hi = Math.max(...ok)
  const raw = Math.max((hi - lo) / bins, 10)
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000]
  const width = steps.find((s) => s >= raw) ?? raw
  const start = Math.floor(lo / width) * width
  const n = Math.floor((hi - start) / width) + 1
  const out = Array.from({ length: n }, (_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }))
  for (const v of ok) out[Math.min(n - 1, Math.floor((v - start) / width))].count++
  return out
}
