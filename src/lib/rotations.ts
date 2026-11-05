import { conj, mul, normalize, type Quat } from './orientation'

type Axis = 'x' | 'y' | 'z'

// a quarter turn named x, y or z is clockwise looking at R, U or F: negative about the screen's +X, +Y, +Z
const quarter = (axis: Axis, turns: number): Quat => {
  const h = (-Math.PI / 4) * turns
  return { x: 0, y: 0, z: 0, [axis]: Math.sin(h), w: Math.cos(h) }
}

const TOKENS = (['x', 'y', 'z'] as const).flatMap((a) => [
  { name: a, q: quarter(a, 1) },
  { name: `${a}'`, q: quarter(a, -1) },
  { name: `${a}2`, q: quarter(a, 2) },
])

const same = (a: Quat, b: Quat) => Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) > 0.999

/** The 24 ways a cube can sit squarely, each with its shortest name as whole-cube rotations from home. */
export const ORIENTATIONS: readonly { q: Quat; name: string }[] = (() => {
  const out = [{ q: { x: 0, y: 0, z: 0, w: 1 } as Quat, name: '' }]
  for (let i = 0; i < out.length; i++) {
    for (const t of TOKENS) {
      // later rotations act in the solver's frame, so they multiply on the left
      const q = normalize(mul(t.q, out[i].q))
      if (!out.some((o) => same(o.q, q))) out.push({ q, name: out[i].name ? `${out[i].name} ${t.name}` : t.name })
    }
  }
  return out
})()

/** Index of the square orientation nearest to q. */
export function snap(q: Quat): number {
  let best = 0
  let bestDot = -1
  ORIENTATIONS.forEach((o, i) => {
    const d = Math.abs(o.q.x * q.x + o.q.y * q.y + o.q.z * q.z + o.q.w * q.w)
    if (d > bestDot) [best, bestDot] = [i, d]
  })
  return best
}

/** Shortest rotation name that takes square orientation `from` to `to`. */
export function rotationName(from: number, to: number): string {
  const delta = normalize(mul(ORIENTATIONS[to].q, conj(ORIENTATIONS[from].q)))
  return ORIENTATIONS[snap(delta)].name
}

// how long a new square orientation must hold before it counts; brief wobbles past 45° do not
const HOLD_MS = 250
// a face turn on the rotation's axis this close in time means a slice (M, E, S) or wide move turned the core, not the hands
const SAME_AXIS_MS = 300
const AXIS_FACES: Record<Axis, string> = { x: 'RL', y: 'UD', z: 'FB' }

export interface RotationDetector {
  /** Feed every orientation reading; returns a rotation like "y'" or "x y" once one is confirmed. */
  feed: (q: Quat, at: number) => string | null
  /** Tell the detector about every face turn, so slices and wide moves are not mistaken for rotations. */
  faceTurn: (move: string, at: number) => void
  /** Start over; the next reading becomes the baseline. */
  reset: () => void
}

export function createRotationDetector(): RotationDetector {
  let settled: number | null = null
  let candidate: number | null = null
  let since = 0
  let faceTimes: Record<string, number> = {}

  const axisBusy = (name: string, from: number, to: number) => {
    const axes = new Set(name.split(' ').map((t) => t[0] as Axis))
    return [...axes].some((a) => [...AXIS_FACES[a]].some((f) => faceTimes[f] != null && faceTimes[f] >= from && faceTimes[f] <= to))
  }

  return {
    feed(q, at) {
      const idx = snap(q)
      if (settled == null) {
        settled = idx
        return null
      }
      if (idx === settled) {
        candidate = null
        return null
      }
      if (idx !== candidate) {
        candidate = idx
        since = at
        return null
      }
      if (at - since < HOLD_MS) return null
      const name = rotationName(settled, idx)
      settled = idx
      candidate = null
      return axisBusy(name, since - SAME_AXIS_MS, at + SAME_AXIS_MS) ? null : name
    },
    faceTurn(move, at) {
      faceTimes = { ...faceTimes, [move[0]]: at }
    },
    reset() {
      settled = null
      candidate = null
      faceTimes = {}
    },
  }
}

export interface TimelineItem {
  m: string
  t: number
  rotation: boolean
}

/** Moves and rotations in time order, for display; a rotation sorts before a move at the same millisecond. */
export function timeline(moves: readonly { m: string; t: number }[] = [], rotations: readonly { m: string; t: number }[] = []): TimelineItem[] {
  return [...rotations.map((r) => ({ ...r, rotation: true })), ...moves.map((m) => ({ ...m, rotation: false }))].sort((a, b) => a.t - b.t)
}

/** How many rotations fall in each phase, given cumulative phase end times. */
export function rotationsPerPhase(rotations: readonly { t: number }[], splits: readonly number[]): number[] {
  return splits.map((end, i) => rotations.filter((r) => r.t <= end && (i === 0 || r.t > splits[i - 1])).length)
}
