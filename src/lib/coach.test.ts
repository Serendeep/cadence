import { expect, test } from 'vitest'
import { findings, lastSitting, measure, SITTING_GAP_MS, sittings } from './coach'
import type { Solve } from './types'

const MIN = 60_000
const solve = (time: number, date: number, phases?: number[]): Solve => ({
  sessionId: 1, time, penalty: 'ok', scramble: '', event: '333', date,
  splits: phases?.reduce<number[]>((acc, d) => [...acc, (acc.at(-1) ?? 0) + d], []),
})

/** Sittings of `size` solves, a minute apart, an hour between sittings; `time(i)` gives the time of the i-th solve in a sitting. */
function practice(count: number, size: number, time: (i: number) => number): Solve[] {
  return Array.from({ length: count * size }, (_, k) => solve(time(k % size), Math.floor(k / size) * 60 * MIN + (k % size) * MIN))
}

test('names the phase that slowed down against the best stretch', () => {
  const good = Array.from({ length: 60 }, (_, i) => solve(14000, i * MIN, [2000, 8000, 2000, 2000]))
  const slowF2l = Array.from({ length: 20 }, (_, i) => solve(15500, (60 + i) * MIN, [2000, 9500, 2000, 2000]))
  const [top] = findings([...good, ...slowF2l])
  expect(top.kind).toBe('phase-1')
  expect(top.gain).toBeCloseTo(1500)
  expect(measure('phase-1', slowF2l)).toBeCloseTo(9500)
})

test('stays quiet when there is too little data or nothing to fix', () => {
  expect(findings(practice(1, 10, () => 12000))).toEqual([])
  expect(findings(practice(5, 40, () => 12000))).toEqual([])
})

test('counts the cost of slow solves', () => {
  const solves = practice(1, 50, (i) => (i % 5 === 0 ? 20000 : 12000))
  const f = findings(solves).find((x) => x.kind === 'consistency')!
  // 10 of 50 solves are 20 s against a 14.4 s cap: (20 - 14.4) / 5 = 1.12 s a solve
  expect(f.gain).toBeCloseTo(1120)
})

test('spots a slow start and a slow finish in sittings', () => {
  const solves = practice(4, 40, (i) => (i < 3 ? 14000 : i >= 30 ? 13500 : 12000))
  const kinds = findings(solves).map((f) => f.kind)
  expect(kinds).toContain('warmup')
  expect(kinds).toContain('fatigue')
  expect(measure('warmup', solves)).toBeCloseTo(2000)
  expect(measure('warmup', practice(4, 40, () => 12000))).toBe(0)
})

test('splits sittings at the break and summarises the last one only after it', () => {
  const solves = practice(2, 6, () => 12000)
  expect(sittings(solves).map((g) => g.length)).toEqual([6, 6])
  const end = solves.at(-1)!.date
  expect(lastSitting(solves, end + 60_000)).toBeNull()
  expect(lastSitting(solves, end + SITTING_GAP_MS)).toMatchObject({ count: 6, mean: 12000, end })
})
