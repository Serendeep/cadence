import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { applyAlg, crossSolved, f2lSolved, invertAlg, isSolved, ollSolved, solvedCube, stateKey, type CubeState } from './cube'
import { drillScramble, OLL_CASES, OLL_GROUPS, OLL_NAMES, parity, PLL_CASES, PLL_NAMES, randomDrillData } from './drills'
import { DRILL_KINDS, type DrillKind } from './types'

const AUF = ['', 'U', "U'", 'U2']
const scrambled = (alg: string) => applyAlg(solvedCube(), alg)
const sum = (v: readonly number[]) => v.reduce((a, b) => a + b, 0)

// in WCA orientation the solved side is U; the last slot is the back-right one (front-right once the solver flips the cube)
const lastSlot = (s: { p: readonly number[] }) => s.p[0] === 1 && s.p[2] === -1
const threePairs = (state: CubeState) => crossSolved(state, 'U') && f2lSolved(state.filter((s) => !lastSlot(s)), 'U')

const intended: Record<DrillKind, (s: CubeState) => boolean> = {
  f2l: (s) => crossSolved(s, 'U'),
  lsll: threePairs,
  oll: (s) => f2lSolved(s, 'U'),
  pll: (s) => ollSolved(s, 'U'),
}

/** Which last-layer stickers show the top colour, the same for every AUF. */
const orientation = (state: CubeState) => AUF.map((a) => applyAlg(state, a)
  .filter((s) => s.c === 'U' && s.p[1] === 1).map((s) => `${s.p}/${s.n}`).sort().join(' ')).sort()[0]
// mirrored by x2 again, a drill scramble has the drilled layer on U
const flip = (wca: string) => scrambled(wca.replace(/[UDFB]/g, (m) => ({ U: 'D', D: 'U', F: 'B', B: 'F' })[m]!))

/** Solved by `alg` with some AUF before and after. */
const isCase = (state: CubeState, alg: string) => AUF.some((a) => AUF.some((b) => isSolved(applyAlg(state, `${a} ${alg} ${b}`))))

describe('drillScramble', () => {
  it.each(DRILL_KINDS)('leaves the intended pieces solved for %s', async (kind) => {
    for (let i = 0; i < 25; i++) {
      const state = scrambled(await drillScramble(kind))
      expect(intended[kind](state)).toBe(true)
      expect(isSolved(state)).toBe(false)
    }
  })

  it('gives only the chosen PLL cases, from the white-top orientation', async () => {
    for (const name of ['T', 'Ga', 'H']) {
      for (let i = 0; i < 4; i++) {
        const wca = await drillScramble('pll', [name])
        const state = scrambled(wca)
        expect(ollSolved(state, 'U')).toBe(true)
        expect(isCase(flip(wca), PLL_CASES[name])).toBe(true)
      }
    }
  })

  it('gives only the chosen OLL cases, from the white-top orientation', async () => {
    for (const name of ['OLL 1', 'OLL 5', 'OLL 6', 'OLL 27', 'OLL 57']) {
      for (let i = 0; i < 4; i++) {
        const wca = await drillScramble('oll', [name])
        expect(f2lSolved(scrambled(wca), 'U')).toBe(true)
        expect(orientation(flip(wca))).toBe(orientation(scrambled(invertAlg(OLL_CASES[name]))))
      }
    }
  })
})

describe('OLL cases', () => {
  it('has OLL 1 to 57', () => expect(OLL_NAMES).toEqual(Array.from({ length: 57 }, (_, i) => `OLL ${i + 1}`)))

  it.each(OLL_NAMES)('%s keeps F2L and orients the last layer', (name) => {
    const state = scrambled(invertAlg(OLL_CASES[name]))
    expect(f2lSolved(state, 'D')).toBe(true)
    expect(ollSolved(state, 'D')).toBe(false)
    expect(ollSolved(applyAlg(state, OLL_CASES[name]), 'D')).toBe(true)
  })

  it('has no two algorithms for the same case', () => {
    expect(new Set(OLL_NAMES.map((n) => orientation(scrambled(invertAlg(OLL_CASES[n]))))).size).toBe(57)
  })

  it('puts every case in exactly one group', () => {
    expect(Object.values(OLL_GROUPS).flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 57 }, (_, i) => i + 1))
  })
})

describe('randomDrillData', () => {
  it.each(DRILL_KINDS)('is always solvable for %s', (kind) => {
    for (let i = 0; i < 500; i++) {
      const { EDGES, CORNERS } = randomDrillData(kind)
      expect(parity(EDGES.pieces)).toBe(parity(CORNERS.pieces))
      expect(sum(EDGES.orientation) % 2).toBe(0)
      expect(sum(CORNERS.orientation) % 3).toBe(0)
      expect([...EDGES.pieces].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      // the cross edges never move
      expect(EDGES.pieces.slice(4, 8)).toEqual([4, 5, 6, 7])
    }
  })

  it('computes permutation parity', () => {
    expect(parity([0, 1, 2])).toBe(0)
    expect(parity([1, 0, 2])).toBe(1)
    expect(parity([1, 2, 0])).toBe(0)
    expect(parity([1, 2, 3, 0])).toBe(1)
  })
})

// pieces of the last layer each case moves: [corners, edges]
const MOVED: Record<string, [number, number]> = {
  Aa: [3, 0], Ab: [3, 0], E: [4, 0], H: [0, 4], Z: [0, 4], Ua: [0, 3], Ub: [0, 3],
  Ga: [3, 3], Gb: [3, 3], Gc: [3, 3], Gd: [3, 3],
  F: [2, 2], Ja: [2, 2], Jb: [2, 2], Na: [2, 2], Nb: [2, 2], Ra: [2, 2], Rb: [2, 2], T: [2, 2], V: [2, 2], Y: [2, 2],
}

describe('PLL cases', () => {
  it('has the 21 cases', () => expect(PLL_NAMES.sort()).toEqual(Object.keys(MOVED).sort()))

  it.each(PLL_NAMES)('%s only permutes the last layer', async (name) => {
    const state = scrambled(PLL_CASES[name])
    expect(ollSolved(state, 'D')).toBe(true)
    expect(isCase(state, '')).toBe(false)
    const kp = await cube3x3x3.kpuzzle()
    const moved = (p: number[]) => p.filter((v, i) => v !== i).length
    // an algorithm may end with the layer turned, so check every final turn
    const counts = AUF.map((b) => {
      const { EDGES, CORNERS } = kp.defaultPattern().applyAlg(`${PLL_CASES[name]} ${b}`).patternData
      expect([...EDGES.orientation, ...CORNERS.orientation].every((o) => o === 0)).toBe(true)
      return [moved(CORNERS.pieces), moved(EDGES.pieces)]
    })
    expect(counts).toContainEqual(MOVED[name])
    expect(Math.min(...counts.map(([c, e]) => c + e))).toBe(MOVED[name][0] + MOVED[name][1])
  })

  it('has no two algorithms for the same case', () => {
    const key = (alg: string) => AUF.flatMap((a) => AUF.map((b) => stateKey(scrambled(`${a} ${alg} ${b}`)))).sort()[0]
    expect(new Set(PLL_NAMES.map((n) => key(PLL_CASES[n]))).size).toBe(21)
  })

  it('tells H (opposite swaps) from Z (adjacent swaps)', async () => {
    const kp = await cube3x3x3.kpuzzle()
    expect(kp.defaultPattern().applyAlg(PLL_CASES.H).patternData.EDGES.pieces[0]).toBe(2)
    expect(kp.defaultPattern().applyAlg(PLL_CASES.Z).patternData.EDGES.pieces[0]).not.toBe(2)
  })
})
