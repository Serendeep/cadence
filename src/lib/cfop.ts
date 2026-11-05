import { applyMove, crossSolved, f2lSolved, FACES, isSolved, ollSolved, type CubeState, type Face } from './cube'
import type { TimedMove } from './types'

export const CFOP_PHASES = ['Cross', 'F2L', 'OLL', 'PLL'] as const

/** Labels for n timing phases: the CFOP steps for four, numbered otherwise. */
export function phaseNames(n: number): string[] {
  return n === 4 ? [...CFOP_PHASES] : Array.from({ length: n }, (_, i) => `Phase ${i + 1}`)
}

export interface PhaseResult {
  /** Face the solver built the cross on */
  face: Face
  /** Index (exclusive) into moves where each phase ended: cross, f2l, oll, pll */
  moveEnds: [number, number, number, number]
  /** Cumulative end time of each phase in ms */
  splits: [number, number, number, number]
}

/**
 * Detects CFOP phase boundaries from a smart-cube move log.
 * Picks the face whose F2L completed first, then walks back to where its cross last became solved,
 * so a cross that was built and broken early does not count.
 */
export function detectCfop(start: CubeState, moves: readonly TimedMove[]): PhaseResult | null {
  const states: CubeState[] = [start]
  for (const mv of moves) states.push(applyMove(states[states.length - 1], mv.m))
  const end = states.length - 1
  if (!isSolved(states[end])) return null

  let face: Face = 'D'
  let f2lAt = end
  for (const f of FACES) {
    const i = states.findIndex((s) => f2lSolved(s, f))
    if (i !== -1 && i < f2lAt) {
      f2lAt = i
      face = f
    }
  }
  let crossAt = f2lAt
  while (crossAt > 0 && crossSolved(states[crossAt - 1], face)) crossAt--
  let ollAt = f2lAt
  while (ollAt < end && !ollSolved(states[ollAt], face)) ollAt++

  const timeAt = (i: number) => (i === 0 ? 0 : moves[i - 1].t)
  const ends: [number, number, number, number] = [crossAt, f2lAt, ollAt, end]
  return {
    face,
    moveEnds: ends,
    splits: ends.map(timeAt) as [number, number, number, number],
  }
}

/** Per-phase durations from cumulative splits. */
export function phaseDurations(splits: readonly number[]): number[] {
  return splits.map((t, i) => t - (i === 0 ? 0 : splits[i - 1]))
}
