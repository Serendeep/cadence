import { Alg } from 'cubing/alg'
import { KPattern, type KPatternData } from 'cubing/kpuzzle'
import { cube3x3x3 } from 'cubing/puzzles'
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search'
import type { DrillKind } from './types'

export const DRILL_NAMES: Record<DrillKind, string> = { f2l: 'F2L', lsll: 'Last slot', oll: 'OLL', pll: 'PLL' }

/** One standard algorithm per PLL case, face turns only, last layer on U. */
export const PLL_CASES: Record<string, string> = {
  Aa: "R' F R' B2 R F' R' B2 R2",
  Ab: "R2 B2 R F R' B2 R F' R",
  E: "R B' R' F R B R' F' R B R' F R B' R' F'",
  F: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  Ga: "R2 U R' U R' U' R U' R2 U' D R' U R D'",
  Gb: "R' U' R U D' R2 U R' U R U' R U' R2 D",
  Gc: "R2 U' R U' R U R' U R2 U D' R U' R' D",
  Gd: "R U R' U' D R2 U' R U' R' U R' U R2 D'",
  H: "R2 U2 R U2 R2 U2 R2 U2 R U2 R2",
  Ja: "R' U L' U2 R U' R' U2 R L",
  Jb: "R U R' F' R U R' U' R' F R2 U' R'",
  Na: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  Nb: "R' U R U' R' F' U' F R U R' F R' F' R U' R",
  Ra: "R U' R' U' R U R D R' U' R D' R' U2 R'",
  Rb: "R2 F R U R U' R' F' R U2 R' U2 R",
  T: "R U R' U' R' F R2 U' R' U' R U R' F'",
  Ua: "R U' R U R U R U' R' U' R2",
  Ub: "R2 U R U R' U' R' U' R' U R'",
  V: "R' U R' U' B' R' B2 U' B' U B' R B R",
  Y: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  Z: "R' U' R2 U R U R' U' R U R U' R U' R'",
}
export const PLL_NAMES = Object.keys(PLL_CASES)

/** One algorithm per OLL case, standard numbering, face turns only, last layer on U. */
export const OLL_CASES: Record<string, string> = {
  'OLL 1': "R U2 R2 F R F' U2 R' F R F'",
  'OLL 2': "F R U R' U' F' B U L U' L' B'",
  'OLL 3': "B U L U' L' B' U' F R U R' U' F'",
  'OLL 4': "B U L U' L' B' U F R U R' U' F'",
  'OLL 5': "L' B2 R B R' B L",
  'OLL 6': "L F2 R' F' R F' L'",
  'OLL 7': "L F R' F R F2 L'",
  'OLL 8': "R' F' L F' L' F2 R",
  'OLL 9': "R U R' U' R' F R2 U R' U' F'",
  'OLL 10': "R U R' U R' F R F' R U2 R'",
  'OLL 11': "L F R' F R' D R D' R F2 L'",
  'OLL 12': "L R2 F' R F' R' F2 R F' R L'",
  'OLL 13': "F U R U' R2 F' R U R U' R'",
  'OLL 14': "R' F R U R' F' R F U' F'",
  'OLL 15': "L' B' L R' U' R U L' B L",
  'OLL 16': "L F L' R U R' U' L F' L'",
  'OLL 17': "R U R' U R' F R F' U2 R' F R F'",
  'OLL 18': "L F R' F R F2 L2 B' R B' R' B2 L",
  'OLL 19': "L' R B R B R' B' L R2 F R F'",
  'OLL 20': "L F R' F' R2 L2 B R B' R' B' L R'",
  'OLL 21': "R U2 R' U' R U R' U' R U' R'",
  'OLL 22': "R U2 R2 U' R2 U' R2 U2 R",
  'OLL 23': "R2 D' R U2 R' D R U2 R",
  'OLL 24': "L F R' F' L' F R F'",
  'OLL 25': "F' L F R' F' L' F R",
  'OLL 26': "R U2 R' U' R U' R'",
  'OLL 27': "R U R' U R U2 R'",
  'OLL 28': "L F R' F' L' R U R U' R'",
  'OLL 29': "R U R' U' R U' R' F' U' F R U R'",
  'OLL 30': "F R' F R2 U' R' U' R U R' F2",
  'OLL 31': "R' U' F U R U' R' F' R",
  'OLL 32': "L U F' U' L' U L F L'",
  'OLL 33': "R U R' U' R' F R F'",
  'OLL 34': "R U R2 U' R' F R U R U' F'",
  'OLL 35': "R U2 R2 F R F' R U2 R'",
  'OLL 36': "L' U' L U' L' U L U L F' L' F",
  'OLL 37': "F R' F' R U R U' R'",
  'OLL 38': "R U R' U R U' R' U' R' F R F'",
  'OLL 39': "L F' L' U' L U F U' L'",
  'OLL 40': "R' F R U R' U' F' U R",
  'OLL 41': "R U R' U R U2 R' F R U R' U' F'",
  'OLL 42': "R' U' R U' R' U2 R F R U R' U' F'",
  'OLL 43': "F' U' L' U L F",
  'OLL 44': "F U R U' R' F'",
  'OLL 45': "F R U R' U' F'",
  'OLL 46': "R' U' R' F R F' U R",
  'OLL 47': "R' U' R' F R F' R' F R F' U R",
  'OLL 48': "F R U R' U' R U R' U' F'",
  'OLL 49': "L F' L2 B L2 F L2 B' L",
  'OLL 50': "L' B L2 F' L2 B' L2 F L'",
  'OLL 51': "F U R U' R' U R U' R' F'",
  'OLL 52': "R U R' U R U' B U' B' R'",
  'OLL 53': "R' F2 L F L' F' L F L' F R",
  'OLL 54': "L F2 R' F' R F R' F' R F' L'",
  'OLL 55': "R' F R U R U' R2 F' R2 U' R' U R U R'",
  'OLL 56': "L' B' L U' R' U R U' R' U R L' B L",
  'OLL 57': "R U R' U' L R' F R F' L'",
}
export const OLL_NAMES = Object.keys(OLL_CASES)

/** OLL cases by the shape the oriented stickers make. */
export const OLL_GROUPS: Record<string, number[]> = {
  Cross: [21, 22, 23, 24, 25, 26, 27],
  Dot: [1, 2, 3, 4, 17, 18, 19, 20],
  'All corners': [28, 57],
  T: [33, 45],
  Square: [5, 6],
  C: [34, 46],
  W: [36, 38],
  P: [31, 32, 43, 44],
  I: [51, 52, 55, 56],
  Fish: [9, 10, 35, 37],
  Knight: [13, 14, 15, 16],
  Awkward: [29, 30, 41, 42],
  Lightning: [7, 8, 11, 12, 39, 40],
  'Small L': [47, 48, 49, 50, 53, 54],
}

/** The cases a drill kind can narrow to, if any. */
export const DRILL_CASES: Partial<Record<DrillKind, Record<string, string>>> = { oll: OLL_CASES, pll: PLL_CASES }

// cubing.js 3x3x3 slots: edges 0-3 U layer, 4-7 D layer, 8 FR, 9-11 other middle edges; corners 0-3 U, 4 DRF, 5-7 other D
const LL = [0, 1, 2, 3]
const FREE: Record<DrillKind, { edges: number[]; corners: number[]; orient: boolean }> = {
  f2l: { edges: [...LL, 8, 9, 10, 11], corners: [0, 1, 2, 3, 4, 5, 6, 7], orient: true },
  lsll: { edges: [...LL, 8], corners: [...LL, 4], orient: true },
  oll: { edges: LL, corners: LL, orient: true },
  pll: { edges: LL, corners: LL, orient: false },
}
const AUF = ['', 'U', "U'", 'U2']
// drills keep the cross on D, where the solver holds it; in WCA orientation (white on U) that is every move mirrored by x2
const X2: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'R', L: 'L' }

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]
const zeros = (n: number) => new Array<number>(n).fill(0)

function shuffled<T>(xs: readonly T[]): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 0 for an even permutation, 1 for odd. */
export function parity(perm: readonly number[]): number {
  const seen = perm.map(() => false)
  let cycles = 0
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue
    cycles++
    for (let j = i; !seen[j]; j = perm[j]) seen[j] = true
  }
  return (perm.length - cycles) % 2
}

/** Random orientations for `n` pieces whose sum is 0 mod `mod`. */
function orientations(n: number, mod: number): number[] {
  const out = Array.from({ length: n - 1 }, () => Math.floor(Math.random() * mod))
  return [...out, (mod * n - out.reduce((a, b) => a + b, 0)) % mod]
}

function place(slots: readonly number[], size: number, pieces: readonly number[], twists: readonly number[]) {
  const perm = Array.from({ length: size }, (_, i) => i)
  const orient = zeros(size)
  slots.forEach((s, i) => {
    perm[s] = pieces[i]
    orient[s] = twists[i]
  })
  return { pieces: perm, orientation: orient }
}

/** A solvable state with only the drill's pieces scrambled. */
export function randomDrillData(kind: DrillKind): Pick<KPatternData, 'EDGES' | 'CORNERS'> {
  const { edges, corners, orient } = FREE[kind]
  const CORNERS = place(corners, 8, shuffled(corners), orient ? orientations(corners.length, 3) : zeros(corners.length))
  const free = shuffled(edges)
  // edge and corner permutation parity must match; swapping two free edges fixes it
  const odd = parity(place(edges, 12, free, zeros(edges.length)).pieces) !== parity(CORNERS.pieces)
  const ep = odd ? [free[1], free[0], ...free.slice(2)] : free
  const EDGES = place(edges, 12, ep, orient ? orientations(edges.length, 2) : zeros(edges.length))
  return { EDGES, CORNERS }
}

const moves = (alg: Alg) => alg.toString().split(/\s+/).filter(Boolean)

async function solveToScramble(pattern: KPattern): Promise<string | null> {
  const scramble = moves((await experimentalSolve3x3x3IgnoringCenters(pattern)).invert())
  // a state one turn from solved is an AUF, not a drill
  return scramble.length <= 1 ? null : scramble.map((m) => X2[m[0]] + m.slice(1).replace("2'", '2')).join(' ')
}

/** A scramble, in WCA orientation, that leaves the cube ready for the drill; `cases` narrows an OLL or PLL drill to those cases. */
export async function drillScramble(kind: DrillKind, cases?: readonly string[] | null): Promise<string> {
  const kp = await cube3x3x3.kpuzzle()
  const table = DRILL_CASES[kind]
  const known = table ? (cases ?? []).filter((c) => c in table) : []
  for (;;) {
    const pattern = table && known.length
      ? kp.defaultPattern().applyAlg(`${pick(AUF)} ${new Alg(table[pick(known)]).invert()} ${pick(AUF)}`)
      : new KPattern(kp, { ...kp.defaultPattern().patternData, ...randomDrillData(kind) })
    const scramble = await solveToScramble(pattern)
    if (scramble) return scramble
  }
}
