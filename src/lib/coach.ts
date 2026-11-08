import { CFOP_PHASES, phaseDurations } from './cfop'
import { DNF, solveValue } from './time'
import type { Solve } from './types'

/** A break this long ends a sitting; the after-break summary card waits for one too. */
export const SITTING_GAP_MS = 10 * 60 * 1000
const PHASE_WINDOW = 20
const MIN_SPLIT_SOLVES = 60
const TAIL_WINDOW = 50
const MIN_TAIL_SOLVES = 25
const BLOWUP_RATIO = 1.2
const WARMUP_SOLVES = 3
const MIN_WARMUP_SITTING = 10
const FATIGUE_SOLVES = 10
const MIN_FATIGUE_SITTING = 30
const RECENT_SITTINGS = 20
const MIN_SITTINGS = 3
// below these a finding is noise, not something worth a drill
const MIN_GAIN_MS = 300
const MIN_EXCESS_RATIO = 0.05

export type FindingKind = 'phase-0' | 'phase-1' | 'phase-2' | 'phase-3' | 'consistency' | 'warmup' | 'fatigue'

export interface Finding {
  kind: FindingKind
  title: string
  detail: string
  /** Time in ms a typical solve would gain if this were fixed */
  gain: number
  /** The value the before/after check compares, in ms; lower is better */
  metric: number
  /** Solves (or sittings) the finding rests on */
  evidence: number
}

export interface Drill {
  title: string
  minutes: number
  steps: string[]
}

const finished = (solves: readonly Solve[]) => solves.filter((s) => solveValue(s) !== DNF)
const avg = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length

function median(v: readonly number[]): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const sec = (ms: number) => `${(ms / 1000).toFixed(2)} s`

const cfopSolves = (solves: readonly Solve[]) => finished(solves).filter((s) => s.splits?.length === 4)

function phaseMeans(solves: readonly Solve[]): number[] {
  const sums = [0, 0, 0, 0]
  for (const s of solves) phaseDurations(s.splits!).forEach((d, i) => (sums[i] += d))
  return sums.map((v) => v / solves.length)
}

/** The PHASE_WINDOW run of split solves with the lowest mean total, so its phases add up to a real stretch of solving. */
function bestStretch(solves: readonly Solve[]): Solve[] {
  let sum = 0
  let bestSum = Infinity
  let bestEnd = -1
  solves.forEach((s, i) => {
    sum += solveValue(s)
    if (i >= PHASE_WINDOW) sum -= solveValue(solves[i - PHASE_WINDOW])
    if (i >= PHASE_WINDOW - 1 && sum < bestSum) {
      bestSum = sum
      bestEnd = i
    }
  })
  return solves.slice(bestEnd - PHASE_WINDOW + 1, bestEnd + 1)
}

function phaseFindings(solves: readonly Solve[]): Finding[] {
  const split = cfopSolves(solves)
  if (split.length < MIN_SPLIT_SOLVES) return []
  const recent = split.slice(-PHASE_WINDOW)
  const now = phaseMeans(recent)
  const then = phaseMeans(bestStretch(split.slice(0, -PHASE_WINDOW)))
  return now.flatMap((m, i) => {
    const gain = m - then[i]
    if (gain < MIN_GAIN_MS) return []
    return [{
      kind: `phase-${i}` as FindingKind,
      title: `${CFOP_PHASES[i]} is ${sec(gain)} slower than at your best`,
      detail: `${sec(m)} over your last ${PHASE_WINDOW} solves, against ${sec(then[i])} in your best stretch.`,
      gain,
      metric: m,
      evidence: split.length,
    }]
  })
}

/** Time the slow solves add to the mean: the mean minus the mean with every solve capped at BLOWUP_RATIO × median. */
function tailCost(values: readonly number[]): { cost: number; blowups: number; cap: number } {
  const cap = median(values) * BLOWUP_RATIO
  return { cost: avg(values) - avg(values.map((v) => Math.min(v, cap))), blowups: values.filter((v) => v > cap).length, cap }
}

function consistencyFinding(solves: readonly Solve[]): Finding[] {
  const values = finished(solves).slice(-TAIL_WINDOW).map(solveValue)
  if (values.length < MIN_TAIL_SOLVES) return []
  const { cost, blowups, cap } = tailCost(values)
  if (cost < MIN_GAIN_MS) return []
  return [{
    kind: 'consistency',
    title: `Slow solves cost you ${sec(cost)} a solve`,
    detail: `${blowups} of your last ${values.length} solves took over ${sec(cap)}, 20% above your median.`,
    gain: cost,
    metric: cost,
    evidence: values.length,
  }]
}

/** Finished solves, grouped wherever the gap between two solves reaches SITTING_GAP_MS. */
export function sittings(solves: readonly Solve[]): Solve[][] {
  const out: Solve[][] = []
  for (const s of solves) {
    const cur = out[out.length - 1]
    if (cur && s.date - cur[cur.length - 1].date < SITTING_GAP_MS) cur.push(s)
    else out.push([s])
  }
  return out.map(finished).filter((g) => g.length > 0)
}

interface SittingEffect {
  /** How much slower the affected solves are than the rest of their sitting (median), averaged over sittings */
  excess: number
  ratio: number
  /** The excess spread over every solve of a typical sitting */
  gain: number
  count: number
}

type Split = (g: Solve[]) => { hit: number[]; rest: number[] }

function sittingEffect(groups: readonly Solve[][], minLength: number, split: Split): SittingEffect | null {
  const long = groups.filter((g) => g.length >= minLength).slice(-RECENT_SITTINGS)
  if (long.length < MIN_SITTINGS) return null
  let excess = 0
  let ratio = 0
  let hits = 0
  for (const g of long) {
    const { hit, rest } = split(g)
    const mid = median(rest)
    excess += avg(hit) - mid
    ratio += (avg(hit) - mid) / mid
    hits += hit.length
  }
  const n = long.length
  return { excess: excess / n, ratio: ratio / n, gain: ((excess / n) * (hits / n)) / avg(long.map((g) => g.length)), count: n }
}

const times = (g: readonly Solve[]) => g.map(solveValue)
const warmupSplit: Split = (g) => ({ hit: times(g.slice(0, WARMUP_SOLVES)), rest: times(g.slice(WARMUP_SOLVES)) })
const fatigueSplit: Split = (g) => ({ hit: times(g.slice(-FATIGUE_SOLVES)), rest: times(g.slice(WARMUP_SOLVES, -FATIGUE_SOLVES)) })

function sittingFindings(solves: readonly Solve[]): Finding[] {
  const groups = sittings(solves)
  const out: Finding[] = []
  const warm = sittingEffect(groups, MIN_WARMUP_SITTING, warmupSplit)
  if (warm && warm.ratio >= MIN_EXCESS_RATIO) {
    out.push({
      kind: 'warmup',
      title: `Your first ${WARMUP_SOLVES} solves are ${sec(warm.excess)} slower`,
      detail: `Compared with the rest of each sitting, over your last ${warm.count} sittings.`,
      gain: warm.gain,
      metric: warm.excess,
      evidence: warm.count,
    })
  }
  const tired = sittingEffect(groups, MIN_FATIGUE_SITTING, fatigueSplit)
  if (tired && tired.ratio >= MIN_EXCESS_RATIO) {
    out.push({
      kind: 'fatigue',
      title: `You slow down by ${sec(tired.excess)} late in long sittings`,
      detail: `Your last ${FATIGUE_SOLVES} solves against the middle of the sitting, over your last ${tired.count} sittings of ${MIN_FATIGUE_SITTING}+.`,
      gain: tired.gain,
      metric: tired.excess,
      evidence: tired.count,
    })
  }
  return out
}

/** What holds these solves back, biggest per-solve gain first. `solves` must be one event, in date order. */
export function findings(solves: readonly Solve[]): Finding[] {
  return [...phaseFindings(solves), ...consistencyFinding(solves), ...sittingFindings(solves)].sort((a, b) => b.gain - a.gain)
}

/** The current value of a finding's metric over `solves`, or null while there are too few to tell. */
export function measure(kind: FindingKind, solves: readonly Solve[]): number | null {
  if (kind.startsWith('phase-')) {
    const split = cfopSolves(solves).slice(-PHASE_WINDOW)
    return split.length >= PHASE_WINDOW / 2 ? phaseMeans(split)[Number(kind.slice(6))] : null
  }
  if (kind === 'consistency') {
    const values = finished(solves).slice(-TAIL_WINDOW).map(solveValue)
    return values.length >= MIN_TAIL_SOLVES ? tailCost(values).cost : null
  }
  const effect = kind === 'warmup'
    ? sittingEffect(sittings(solves), MIN_WARMUP_SITTING, warmupSplit)
    : sittingEffect(sittings(solves), MIN_FATIGUE_SITTING, fatigueSplit)
  return effect ? Math.max(0, effect.excess) : null
}

export const DRILLS: Record<FindingKind, Drill> = {
  'phase-0': {
    title: 'Plan the whole cross in inspection',
    minutes: 10,
    steps: [
      'Scramble, then use the full 15 seconds to plan every cross move. Start only when you can say the whole cross.',
      'Solve just the cross without looking at the cube. Check it, then scramble again.',
      'Once that feels easy, also find the first F2L pair before you start.',
    ],
  },
  'phase-1': {
    title: 'Slow solves with no pauses',
    minutes: 15,
    steps: [
      'Solve slowly enough that you never stop turning between pairs.',
      'While you insert one pair, find the next. If you pause, slow down more.',
      'Do 12 solves like this, then a timed average of 5 at your normal speed.',
    ],
  },
  'phase-2': {
    title: 'Drill the OLL cases you hesitate on',
    minutes: 10,
    steps: [
      'Write down the OLL cases you recognise slowly or stop in the middle of.',
      'Set each one up and solve it 10 times, from a different angle each time.',
      'Then mix the cases in random order, so you practise recognising them as well as executing them.',
    ],
  },
  'phase-3': {
    title: 'Drill PLL recognition from two sides',
    minutes: 10,
    steps: [
      'Write down the PLL cases you recognise slowly or stop in the middle of.',
      'Set each one up and name it from the two faces you can see before you turn. Then solve it.',
      "Mix the cases and the angle (U, U2, U') so you never know what is coming.",
    ],
  },
  consistency: {
    title: 'Routine averages of 5',
    minutes: 15,
    steps: [
      'Use the same routine before every solve: grip, inspection plan, start.',
      'Solve at about 90% of your top speed, where you rarely lock up.',
      'Do averages of 5 and count the solves within 10% of the average. Aim for all five.',
    ],
  },
  warmup: {
    title: 'Warm up before you time',
    minutes: 5,
    steps: [
      'Before timing anything, do 5 slow, untimed solves, looking ahead.',
      'Then run through the finger tricks you use most, at full speed.',
      'Only then start timing. Warm up the same way before your group at a competition.',
    ],
  },
  fatigue: {
    title: 'Shorter sittings with breaks',
    minutes: 5,
    steps: [
      'Take a 5-minute break after every 25 solves.',
      'End the sitting once three solves in a row are well above your average.',
      'Several short sittings a day beat one long one.',
    ],
  },
}

export interface SittingSummary {
  count: number
  mean: number | null
  best: number | null
  /** Mean of up to 100 finished solves before the sitting; null with fewer than 12 */
  usual: number | null
  /** Date of the sitting's last solve, which identifies it */
  end: number
}

/** The last sitting of `solves`, once a SITTING_GAP_MS break has followed it. */
export function lastSitting(solves: readonly Solve[], now: number, minSolves = 5): SittingSummary | null {
  const last = solves[solves.length - 1]
  if (!last || now - last.date < SITTING_GAP_MS) return null
  let start = solves.length - 1
  while (start > 0 && solves[start].date - solves[start - 1].date < SITTING_GAP_MS) start--
  const group = solves.slice(start)
  if (group.length < minSolves) return null
  const ok = finished(group).map(solveValue)
  const before = finished(solves.slice(0, start)).slice(-100).map(solveValue)
  return {
    count: group.length,
    mean: ok.length ? avg(ok) : null,
    best: ok.length ? Math.min(...ok) : null,
    usual: before.length >= 12 ? avg(before) : null,
    end: last.date,
  }
}
