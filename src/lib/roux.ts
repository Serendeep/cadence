import { blocksSolved, blockTurns, cmllSolved, FACES, isSolved, opposite, replay, sideFaces, type CubeState, type Face } from './cube'
import type { TimedMove } from './types'

export interface RouxResult {
  /** Side layer of the first block, and the face both blocks sit on */
  side: Face
  bottom: Face
  /** Index (exclusive) into moves where each phase ended: first block, second block, CMLL, LSE */
  moveEnds: [number, number, number, number]
  /** Cumulative end time of each phase in ms */
  splits: [number, number, number, number]
}

/**
 * Detects Roux phase boundaries from a smart-cube move log.
 * Picks the block pair finished first, then whichever of its blocks was built first; each phase ends the first time its state is reached.
 */
export function detectRoux(start: CubeState, moves: readonly TimedMove[]): RouxResult | null {
  const states = replay(start, moves)
  const end = states.length - 1
  if (!isSolved(states[end])) return null

  let side: Face = 'L'
  let bottom: Face = 'D'
  let sbAt = end
  for (const s of FACES) {
    for (const b of sideFaces(s)) {
      const i = states.findIndex((st) => blocksSolved(st, s, b))
      if (i !== -1 && i < sbAt) [sbAt, side, bottom] = [i, s, b]
    }
  }
  const builtAt = (s: Face) => states.findIndex((st) => blockTurns(st, s, bottom) !== -1)
  const [a, b] = [builtAt(side), builtAt(opposite(side))]
  if (b < a) side = opposite(side)
  let cmllAt = sbAt
  while (cmllAt < end && !cmllSolved(states[cmllAt], side, bottom)) cmllAt++

  const timeAt = (i: number) => (i === 0 ? 0 : moves[i - 1].t)
  const ends: [number, number, number, number] = [Math.min(a, b), sbAt, cmllAt, end]
  return { side, bottom, moveEnds: ends, splits: ends.map(timeAt) as [number, number, number, number] }
}

/** How far into Roux the cube is right now, colour neutral: 0 none, 1 first block, 2 second block, 3 CMLL. */
export function rouxProgress(cube: CubeState): number {
  let best = 0
  for (const s of FACES) {
    for (const b of sideFaces(s)) {
      if (cmllSolved(cube, s, b)) return 3
      if (blocksSolved(cube, s, b)) best = 2
      else if (best === 0 && blockTurns(cube, s, b) !== -1) best = 1
    }
  }
  return best
}
