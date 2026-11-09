import { DNF } from './time'

/** WCA-style average of the last n values: trims ceil(5%) from each end; DNF if more DNFs than trimmed. */
export function averageOf(values: readonly number[], n: number): number | null {
  if (n < 3 || values.length < n) return null
  return trimmedMean(values.slice(-n))
}

function trimmedMean(window: readonly number[]): number {
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

/** First index in sorted `a` whose value is not below v. */
function lowerBound(a: readonly number[], v: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (a[mid] < v) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Rolling aoN for every index; null until n solves exist.
 * Keeps one sorted window that slides along, instead of sorting a copy per solve: 40k solves of ao100 drop from ~0.5 s to a few ms.
 */
export function rollingAverage(values: readonly number[], n: number): (number | null)[] {
  const trim = Math.ceil(n * 0.05)
  const window: number[] = []
  return values.map((v, i) => {
    window.splice(lowerBound(window, v), 0, v)
    if (i >= n) window.splice(lowerBound(window, values[i - n]), 1)
    if (i + 1 < n) return null
    // DNF is Infinity, so it sorts last: a kept DNF means more DNFs than the trim allows
    if (window[n - trim - 1] === DNF) return DNF
    let sum = 0
    for (let k = trim; k < n - trim; k++) sum += window[k]
    return sum / (n - 2 * trim)
  })
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

function stdDev(values: readonly number[]): number | null {
  const ok = values.filter((v) => v !== DNF)
  if (ok.length < 2) return null
  const m = ok.reduce((a, b) => a + b, 0) / ok.length
  return Math.sqrt(ok.reduce((a, v) => a + (v - m) ** 2, 0) / (ok.length - 1))
}

const AVERAGE_SIZES = [5, 12, 50, 100, 1000] as const

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

export interface AverageRecord {
  label: string
  current: number | null
  best: number | null
  /** Index of the solve that completed the best, so its date can be shown */
  bestAt: number | null
}

/** Lowest value and its index, ignoring nulls. */
function bestWithIndex(values: readonly (number | null)[]): { best: number | null; at: number | null } {
  let at: number | null = null
  values.forEach((v, i) => {
    if (v != null && (at == null || v < values[at]!)) at = i
  })
  return { best: at == null ? null : values[at], at }
}

const rollingMean = (values: readonly number[], n: number) => values.map((_, i) => (i + 1 < n ? null : meanOf(values.slice(0, i + 1), n)))

/** Single, mo3 and every aoN the history is long enough for: current value, best value and where the best was set. */
export function averageRecords(values: readonly number[]): AverageRecord[] {
  const single = bestWithIndex(values.map((v) => (v === DNF ? null : v)))
  const rows: AverageRecord[] = [{ label: 'single', current: values.at(-1) ?? null, best: single.best, bestAt: single.at }]
  if (values.length >= 3) {
    // shortcut: mo3 over the last 20k solves only, the slicing mean is O(n²) in memory churn beyond that
    const tail = values.slice(-20000)
    const m = bestWithIndex(rollingMean(tail, 3))
    rows.push({ label: 'mo3', current: meanOf(values, 3), best: m.best, bestAt: m.at == null ? null : m.at + values.length - tail.length })
  }
  for (const n of AVERAGE_SIZES) {
    if (values.length < n || (n === 1000 && values.length > 20000)) continue
    const r = bestWithIndex(rollingAverage(values, n))
    rows.push({ label: `ao${n}`, current: averageOf(values, n), best: r.best, bestAt: r.at })
  }
  return rows
}

/** Median of finished solves. */
export function median(values: readonly number[]): number | null {
  const ok = values.filter((v) => v !== DNF).sort((a, b) => a - b)
  if (!ok.length) return null
  const m = ok.length >> 1
  return ok.length % 2 ? ok[m] : (ok[m - 1] + ok[m]) / 2
}

const SUB_X_STEPS_S = [1, 2, 5, 10, 15, 30, 60]

/** Up to six round thresholds from just above the best single to about the 90th percentile, with how many solves beat each. */
export function subX(values: readonly number[]): { under: number; count: number }[] {
  const ok = values.filter((v) => v !== DNF).sort((a, b) => a - b)
  if (ok.length < 5) return []
  const first = Math.floor(ok[0] / 1000) + 1
  const p90 = ok[Math.floor(ok.length * 0.9)] / 1000
  const step = SUB_X_STEPS_S.find((s) => first + s * 5 >= p90) ?? 60
  const start = Math.ceil(first / step) * step
  return Array.from({ length: 6 }, (_, i) => {
    const under = (start + i * step) * 1000
    return { under, count: ok.filter((v) => v < under).length }
  })
}
