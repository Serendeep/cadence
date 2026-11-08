import { expect, test } from 'vitest'
import { applyAlg, invertAlg, solvedCube, splitAlg, type Face } from './cube'
import { detectRoux, rouxProgress } from './roux'

// a smart cube keeps its centres still, so M reaches it as R and L turns while the solver's frame rotates by x
const SLICES: Record<string, [string, 1 | -1 | 2]> = {
  M: ["R L'", -1], "M'": ["R' L", 1], M2: ['R2 L2', 2], r: ['L', 1], "r'": ["L'", -1],
}
const X_CYCLE: Face[] = ['U', 'F', 'D', 'B']

/** Translates a solve written with M and r, phase by phase, into the face turns a smart cube reports. */
function asReported(phases: string[]): string[][] {
  let map: Record<Face, Face> = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' }
  return phases.map((alg) => splitAlg(alg).flatMap((m) => {
    const slice = SLICES[m]
    if (!slice) return [map[m[0] as Face] + m.slice(1)]
    // an x turn brings the face in front to the top
    const k = (slice[1] + 4) % 4
    const next = { ...map }
    X_CYCLE.forEach((f, i) => (next[f] = map[X_CYCLE[(i + k) % 4]]))
    map = next
    return splitAlg(slice[0])
  }))
}

test('phases split where the blocks, CMLL and LSE of a real Roux solve finish', () => {
  const fb = "B2 R U' D' F2 L' U2 F'"
  // slices in each phase net to no x turn, so the blocks finish with D underneath
  const sb = "U' R' U M U' R2 U' M' U r U r'"
  const cmll = "R U R' U R U2 R'"
  const lse = "M' U M U2 M' U M' U2 M2"
  const phases = asReported([fb, sb, cmll, lse])
  const solve = phases.flat()
  const start = applyAlg(solvedCube(), invertAlg(solve.join(' ')))
  const moves = solve.map((m, i) => ({ m, t: (i + 1) * 100 }))
  const ends = phases.map((_, i) => phases.slice(0, i + 1).flat().length)

  const r = detectRoux(start, moves)!
  expect([r.side, r.bottom]).toEqual(['L', 'D'])
  expect(r.moveEnds).toEqual(ends)
  expect(r.splits).toEqual(ends.map((n) => n * 100))
  expect(rouxProgress(applyAlg(start, solve.slice(0, ends[1]).join(' ')))).toBe(2)
  expect(detectRoux(start, moves.slice(0, -1))).toBeNull()
})
