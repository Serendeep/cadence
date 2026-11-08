import { phaseDurations, type Method } from './cfop'
import { DNF, solveValue } from './time'
import type { Solve } from './types'

export interface DayStat {
  day: string
  /** Epoch ms at local midnight */
  start: number
  count: number
  mean: number | null
  best: number | null
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function byDay(solves: readonly Solve[]): DayStat[] {
  const map = new Map<string, { start: number; vals: number[] }>()
  for (const s of solves) {
    const d = new Date(s.date)
    const k = dayKey(d)
    const e = map.get(k) ?? { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), vals: [] }
    e.vals.push(solveValue(s))
    map.set(k, e)
  }
  return [...map.entries()]
    .map(([day, { start, vals }]) => {
      const ok = vals.filter((v) => v !== DNF)
      return {
        day,
        start,
        count: vals.length,
        mean: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null,
        best: ok.length ? Math.min(...ok) : null,
      }
    })
    .sort((a, b) => a.start - b.start)
}

/** Solves that set a new best single, in order. */
export function pbHistory(solves: readonly Solve[]): Solve[] {
  let bestSoFar = DNF
  const out: Solve[] = []
  for (const s of solves) {
    const v = solveValue(s)
    if (v < bestSoFar) {
      bestSoFar = v
      out.push(s)
    }
  }
  return out
}

/** Solve counts by weekday (0 = Monday) and hour. */
export function practiceGrid(solves: readonly Solve[]): number[][] {
  const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const s of solves) {
    const d = new Date(s.date)
    g[(d.getDay() + 6) % 7][d.getHours()]++
  }
  return g
}

export interface PhaseAverages {
  count: number
  /** Mean duration of each phase in ms */
  means: number[]
}

/** Mean phase durations over the latest `limit` finished solves that carry `phases` splits; four splits must be from `method`. */
export function phaseAverages(solves: readonly Solve[], phases: number, method: Method = 'cfop', limit = 50): PhaseAverages | null {
  const withSplits = solves.filter((s) => s.penalty !== 'dnf' && s.splits?.length === phases && (phases !== 4 || (s.method ?? 'cfop') === method)).slice(-limit)
  if (!withSplits.length) return null
  const sums = Array<number>(phases).fill(0)
  for (const s of withSplits) phaseDurations(s.splits!).forEach((d, i) => (sums[i] += d))
  return { count: withSplits.length, means: sums.map((v) => v / withSplits.length) }
}

/** Most common split count among solves, so insights can pick CFOP (4) or a user's own phase setup. */
export function commonPhaseCount(solves: readonly Solve[]): number | null {
  const counts = new Map<number, number>()
  for (const s of solves) if (s.splits && s.splits.length > 1) counts.set(s.splits.length, (counts.get(s.splits.length) ?? 0) + 1)
  let best: number | null = null
  for (const [k, v] of counts) if (best == null || v > (counts.get(best) ?? 0)) best = k
  return best
}
