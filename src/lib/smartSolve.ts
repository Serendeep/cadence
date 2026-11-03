import { detectCfop } from './cfop'
import { applyAlg, applyMove, invertAlg, isFaceMove, isSolved, solvedCube, splitAlg, stateKey, type CubeState } from './cube'
import type { TimedMove } from './types'

export type TrackerPhase = 'scrambling' | 'armed' | 'solving'

export interface Tracker {
  cube: CubeState
  scramble: string[]
  /** stateKey after each scramble prefix, index 0 = solved */
  prefixKeys: string[]
  phase: TrackerPhase
  /** Scramble moves already applied correctly */
  progress: number
  /** Moves made since the cube last matched a scramble prefix */
  deviation: string[]
  start: number
  startCube: CubeState
  moves: TimedMove[]
}

export interface SmartFinish {
  time: number
  moves: TimedMove[]
  splits?: number[]
}

export function newTracker(scramble: string, cube: CubeState = solvedCube()): Tracker {
  const moves = splitAlg(scramble).filter(isFaceMove)
  const prefixKeys = [stateKey(solvedCube())]
  let s = solvedCube()
  for (const m of moves) {
    s = applyMove(s, m)
    prefixKeys.push(stateKey(s))
  }
  const base: Tracker = { cube, scramble: moves, prefixKeys, phase: 'scrambling', progress: 0, deviation: [], start: 0, startCube: cube, moves: [] }
  return locate(base)
}

function locate(t: Tracker): Tracker {
  const k = t.prefixKeys.lastIndexOf(stateKey(t.cube))
  if (k === -1) return t
  return { ...t, progress: k, deviation: [], phase: k === t.scramble.length ? 'armed' : 'scrambling' }
}

const AMOUNT: Record<string, number> = { '': 1, '2': 2, "'": 3 }
const SUFFIX = ['', '', '2', "'"]

/** Merges consecutive turns of the same face so "R R" reads as "R2" and "R R'" disappears. */
export function simplify(moves: readonly string[]): string[] {
  const out: string[] = []
  for (const m of moves) {
    const prev = out[out.length - 1]
    if (prev && prev[0] === m[0]) {
      const q = (AMOUNT[prev.slice(1)] + AMOUNT[m.slice(1)]) % 4
      out.pop()
      if (q) out.push(m[0] + SUFFIX[q])
    } else out.push(m)
  }
  return out
}

/** What the user should do next while scrambling: the fix for a wrong turn, or the remaining scramble. */
export function scrambleHint(t: Tracker): { undo: string; remaining: string[] } {
  const dev = simplify(t.deviation)
  const next = t.scramble[t.progress]
  // half of a double turn is progress, not a mistake
  if (dev.length === 1 && next?.endsWith('2') && dev[0][0] === next[0] && !dev[0].endsWith('2'))
    return { undo: '', remaining: [dev[0], ...t.scramble.slice(t.progress + 1)] }
  return { undo: dev.length ? invertAlg(dev.join(' ')) : '', remaining: t.scramble.slice(t.progress) }
}

export function trackMove(t: Tracker, move: string, at: number): { tracker: Tracker; finished?: SmartFinish } {
  if (!isFaceMove(move)) return { tracker: t }
  const cube = applyMove(t.cube, move)
  if (t.phase === 'scrambling') {
    const onTrack = t.prefixKeys.includes(stateKey(cube))
    return { tracker: onTrack ? locate({ ...t, cube }) : { ...t, cube, deviation: [...t.deviation, move] } }
  }
  if (t.phase === 'armed') {
    const next: Tracker = { ...t, cube, phase: 'solving', start: at, startCube: t.cube, moves: [{ m: move, t: 0 }] }
    return { tracker: next }
  }
  const moves = [...t.moves, { m: move, t: Math.max(0, Math.round(at - t.start)) }]
  if (!isSolved(cube)) return { tracker: { ...t, cube, moves } }
  const cfop = detectCfop(t.startCube, moves)
  const time = moves[moves.length - 1].t
  return {
    tracker: { ...t, cube, moves },
    finished: { time, moves, splits: cfop?.splits.map((v) => Math.min(v, time)) },
  }
}

/** Treat the physical cube as solved again, e.g. after the user resets it by hand. */
export const resetTracker = (t: Tracker): Tracker => newTracker(t.scramble.join(' '))

export const trackerFromState = (scramble: string, cube: CubeState): Tracker => newTracker(scramble, cube)

export const scrambledState = (scramble: string) => applyAlg(solvedCube(), splitAlg(scramble).filter(isFaceMove).join(' '))
