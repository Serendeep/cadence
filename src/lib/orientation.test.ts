import { expect, test } from 'vitest'
import { angleBetween, ganToScreen, IDENTITY, moyuToScreen, mul, relativeTo, slerp, type Quat } from './orientation'

const about = (axis: 'x' | 'y' | 'z', deg: number): Quat => {
  const h = (deg * Math.PI) / 360
  return { x: 0, y: 0, z: 0, [axis]: Math.sin(h), w: Math.cos(h) }
}
const close = (a: Quat, b: Quat) => {
  // q and -q are the same rotation
  const s = Math.sign(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z) || 1
  for (const k of ['x', 'y', 'z', 'w'] as const) expect(a[k] * s).toBeCloseTo(b[k], 6)
}

test('the home position reads as no rotation', () => {
  const home = about('x', 37)
  close(relativeTo(home, home), IDENTITY)
})

test('a turn after setting home reads as that turn alone', () => {
  const home = about('z', 50)
  const now = mul(about('y', 90), home)
  close(relativeTo(home, now), about('y', 90))
})

test("GAN's up axis (+Z, white) becomes the screen's up axis (+Y)", () => {
  close(ganToScreen(about('z', 90)), about('y', 90))
  close(ganToScreen(about('x', 90)), about('x', 90))
  close(ganToScreen(about('y', 90)), about('z', -90))
})

// readings from a MoYu V10 AI held white up, green front, then turned by whole-cube x, y and z (diagnostics log)
const MOYU_HOME: Quat = { x: -0.059, y: -0.035, z: -0.005, w: 0.998 }
const MOYU_AFTER_Y: Quat = { x: -0.049, y: -0.689, z: 0.079, w: 0.719 }
const MOYU_AFTER_X: Quat = { x: 0.76, y: -0.034, z: -0.005, w: -0.649 }
const MOYU_AFTER_Z: Quat = { x: -0.092, y: -0.012, z: -0.699, w: 0.709 }

/** The axis a relative rotation turns about, in screen axes, signed by the turn direction. */
function dominantAxis(q: Quat): string {
  const s = Math.sign(q.w) || 1
  const v = { x: q.x * s, y: q.y * s, z: q.z * s }
  const k = (['x', 'y', 'z'] as const).reduce((a, b) => (Math.abs(v[a]) >= Math.abs(v[b]) ? a : b))
  return `${v[k] < 0 ? '-' : '+'}${k}`
}

test('MoYu whole-cube turns come out about the matching screen axes', () => {
  // x, y and z are clockwise looking at R, U and F, which is negative about +X, +Y and +Z
  expect(dominantAxis(relativeTo(moyuToScreen(MOYU_HOME), moyuToScreen(MOYU_AFTER_Y)))).toBe('-y')
  expect(dominantAxis(relativeTo(moyuToScreen(MOYU_HOME), moyuToScreen(MOYU_AFTER_X)))).toBe('-x')
  expect(dominantAxis(relativeTo(moyuToScreen(MOYU_HOME), moyuToScreen(MOYU_AFTER_Z)))).toBe('-z')
})

test('slerp moves part of the way and takes the short arc when the target arrives sign-flipped', () => {
  const target = about('y', 90)
  close(slerp(IDENTITY, target, 0.5), about('y', 45))
  const flipped: Quat = { x: -target.x, y: -target.y, z: -target.z, w: -target.w }
  close(slerp(IDENTITY, flipped, 0.5), about('y', 45))
  expect(angleBetween(IDENTITY, flipped)).toBeCloseTo(Math.PI / 2, 6)
})
