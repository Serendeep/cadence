import { expect, test } from 'vitest'
import { mul, type Quat } from './orientation'
import { createRotationDetector, ORIENTATIONS, rotationName, rotationsPerPhase, snap, timeline } from './rotations'

const turn = (axis: 'x' | 'y' | 'z', deg: number): Quat => {
  const h = (-deg * Math.PI) / 360
  return { x: 0, y: 0, z: 0, [axis]: Math.sin(h), w: Math.cos(h) }
}
const HOME: Quat = { x: 0, y: 0, z: 0, w: 1 }

test('there are 24 square orientations with one-token names for single rotations', () => {
  expect(ORIENTATIONS).toHaveLength(24)
  expect(rotationName(snap(HOME), snap(turn('y', 90)))).toBe('y')
  expect(rotationName(snap(HOME), snap(turn('x', -90)))).toBe("x'")
  expect(rotationName(snap(HOME), snap(turn('z', 180)))).toBe('z2')
})

test('a held rotation is reported once, with wrist tilts ignored', () => {
  const d = createRotationDetector()
  expect(d.feed(HOME, 0)).toBeNull()
  expect(d.feed(turn('y', 30), 50)).toBeNull()
  expect(d.feed(HOME, 100)).toBeNull()
  expect(d.feed(turn('y', 85), 200)).toBeNull()
  expect(d.feed(turn('y', 92), 500)).toBe('y')
  expect(d.feed(turn('y', 90), 800)).toBeNull()
})

test('a brief swing past 45 degrees that comes back is not a rotation', () => {
  const d = createRotationDetector()
  d.feed(HOME, 0)
  expect(d.feed(turn('x', 60), 100)).toBeNull()
  expect(d.feed(turn('x', 60), 200)).toBeNull()
  expect(d.feed(HOME, 300)).toBeNull()
  expect(d.feed(HOME, 900)).toBeNull()
})

test('rotations compose in the solver frame', () => {
  const d = createRotationDetector()
  d.feed(HOME, 0)
  d.feed(turn('y', 90), 100)
  expect(d.feed(turn('y', 90), 400)).toBe('y')
  const yThenX = mul(turn('x', 90), turn('y', 90))
  d.feed(yThenX, 500)
  expect(d.feed(yThenX, 800)).toBe('x')
})

test('an M slice turns the core about x but is not a rotation', () => {
  const d = createRotationDetector()
  d.feed(HOME, 0)
  d.faceTurn('R', 120)
  d.faceTurn("L'", 130)
  d.feed(turn('x', -90), 100)
  expect(d.feed(turn('x', -90), 400)).toBeNull()
})

test('a face turn on another axis does not hide a rotation', () => {
  const d = createRotationDetector()
  d.feed(HOME, 0)
  d.faceTurn('U', 120)
  d.feed(turn('x', 90), 100)
  expect(d.feed(turn('x', 90), 400)).toBe('x')
})

test('rotations interleave with moves by time and are counted per phase', () => {
  const moves = [{ m: 'R', t: 100 }, { m: 'U', t: 300 }]
  const rotations = [{ m: 'y', t: 200 }, { m: 'x', t: 900 }]
  expect(timeline(moves, rotations).map((i) => (i.rotation ? `(${i.m})` : i.m)).join(' ')).toBe('R (y) U (x)')
  expect(rotationsPerPhase(rotations, [250, 500, 1000])).toEqual([1, 0, 1])
})
