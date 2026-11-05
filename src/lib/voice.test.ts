import { expect, test } from 'vitest'
import { inspectionCaller } from './voice'

test('each inspection call plays once per inspection and again for the next one', () => {
  const played: number[] = []
  const call = inspectionCaller((_, m) => played.push(m))
  for (const t of [0, 7999, 8000, 8016, 11000, 12001, 12500, 14000]) call('male', 100, t)
  expect(played).toEqual([8000, 12000])
  call('male', 50000, 8100)
  expect(played).toEqual([8000, 12000, 8000])
})

test('a call missed by more than a second stays silent', () => {
  const played: number[] = []
  const call = inspectionCaller((_, m) => played.push(m))
  call('male', 0, 12500)
  expect(played).toEqual([12000])
})
