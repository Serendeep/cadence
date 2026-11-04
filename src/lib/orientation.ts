/** Unit quaternion; screen frame is three.js's: +X towards R, +Y towards U, +Z towards F. */
export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 }

export function mul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

export const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })

export function normalize(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n }
}

const dot = (a: Quat, b: Quat) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w

/** Angle in radians between two orientations (q and -q are the same orientation). */
export const angleBetween = (a: Quat, b: Quat): number => 2 * Math.acos(Math.min(1, Math.abs(dot(a, b))))

/** Spherical interpolation from a towards b by t in [0, 1], always the short way round. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = dot(a, b)
  // q and -q are the same orientation; flip so the blend takes the shorter arc instead of swinging the long way
  const bb = d < 0 ? { x: -b.x, y: -b.y, z: -b.z, w: -b.w } : b
  d = Math.abs(d)
  if (d > 0.9995) return normalize({ x: a.x + (bb.x - a.x) * t, y: a.y + (bb.y - a.y) * t, z: a.z + (bb.z - a.z) * t, w: a.w + (bb.w - a.w) * t })
  const theta = Math.acos(d)
  const sa = Math.sin((1 - t) * theta) / Math.sin(theta)
  const sb = Math.sin(t * theta) / Math.sin(theta)
  return { x: a.x * sa + bb.x * sb, y: a.y * sa + bb.y * sb, z: a.z * sa + bb.z * sb, w: a.w * sa + bb.w * sb }
}

/** GAN reports +X red (R), +Y blue (B), +Z white (U); the screen wants +Y as U and +Z as F. */
export const ganToScreen = (q: Quat): Quat => ({ x: q.x, y: q.z, z: -q.y, w: q.w })

/** MoYu32 already reports in screen axes (+X R, +Y U, +Z F); confirmed with x, y and z turns of a V10 AI. */
export const moyuToScreen = (q: Quat): Quat => normalize(q)

/** Orientation now, relative to the moment the cube was held in the home position (white up, green front). */
export const relativeTo = (home: Quat, now: Quat): Quat => normalize(mul(now, conj(home)))
