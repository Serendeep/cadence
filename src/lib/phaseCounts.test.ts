import { expect, test } from 'vitest'
import { phaseCounts } from './smartSolve'

test('counts moves and rotations per phase from their timestamps', () => {
  const moves = [0, 500, 900, 1500, 2600, 3000].map((t) => ({ m: 'R', t }))
  expect(phaseCounts([1000, 2000, 2500, 3000], moves, [{ m: 'y', t: 1200 }])).toEqual([
    { moves: 3, rotations: 0 },
    { moves: 1, rotations: 1 },
    { moves: 0, rotations: 0 },
    { moves: 2, rotations: 0 },
  ])
})
