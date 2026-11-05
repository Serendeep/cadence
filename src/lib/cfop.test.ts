import { expect, test } from 'vitest'
import { detectCfop } from './cfop'
import { applyAlg, invertAlg, solvedCube } from './cube'

test('phases split where the cross, F2L, OLL and PLL of a real solve finish', () => {
  const cross = "D R' F"
  const f2l = "R U R' U' L' U' L U R' U' R U2 L U L'"
  const oll = "R U R' U R U2 R'"
  const pll = "R U R' U' R' F R2 U' R' U' R U R' F'"
  const solve = `${cross} ${f2l} ${oll} ${pll}`
  const start = applyAlg(solvedCube(), invertAlg(solve))
  const moves = solve.split(' ').map((m, i) => ({ m, t: (i + 1) * 100 }))
  const n = (alg: string) => alg.split(' ').length
  const r = detectCfop(start, moves)!
  expect(r.face).toBe('D')
  expect(r.moveEnds).toEqual([n(cross), n(cross) + n(f2l), n(cross) + n(f2l) + n(oll), moves.length])
})
