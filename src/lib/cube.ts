/**
 * Minimal 3x3 facelet model: every sticker knows its cubie position and normal, so
 * moves are rotations and "is this sticker solved" is a colour-vs-normal check.
 * Centres never move (face turns only), which matches what smart cubes report.
 */
export type Face = 'U' | 'D' | 'F' | 'B' | 'R' | 'L'
type Vec = readonly [number, number, number]

export interface Sticker {
  readonly p: Vec
  readonly n: Vec
  readonly c: Face
}
export type CubeState = readonly Sticker[]

const NORMALS: Record<Face, Vec> = {
  U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0],
}
export const FACES = Object.keys(NORMALS) as Face[]

type Rot = (v: Vec) => Vec
const TURNS: Record<Face, { axis: 0 | 1 | 2; side: 1 | -1; rot: Rot }> = {
  R: { axis: 0, side: 1, rot: ([x, y, z]) => [x, z, -y] },
  L: { axis: 0, side: -1, rot: ([x, y, z]) => [x, -z, y] },
  U: { axis: 1, side: 1, rot: ([x, y, z]) => [-z, y, x] },
  D: { axis: 1, side: -1, rot: ([x, y, z]) => [z, y, -x] },
  F: { axis: 2, side: 1, rot: ([x, y, z]) => [y, -x, z] },
  B: { axis: 2, side: -1, rot: ([x, y, z]) => [-y, x, z] },
}

export function solvedCube(): CubeState {
  const out: Sticker[] = []
  for (const c of FACES) {
    const n = NORMALS[c]
    const free = [0, 1, 2].filter((i) => n[i] === 0)
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const p = [...n] as [number, number, number]
        p[free[0]] = a
        p[free[1]] = b
        out.push({ p, n, c })
      }
  }
  return out
}

const MOVE_RE = /^([UDFBRL])(2|')?$/

export function isFaceMove(m: string): boolean {
  return MOVE_RE.test(m)
}

export function applyMove(state: CubeState, move: string): CubeState {
  const match = MOVE_RE.exec(move)
  if (!match) throw new Error(`Unsupported move "${move}"`)
  const { axis, side, rot } = TURNS[match[1] as Face]
  const k = match[2] === "'" ? 3 : match[2] === '2' ? 2 : 1
  return state.map((s) => {
    if (s.p[axis] !== side) return s
    let p = s.p
    let n = s.n
    for (let i = 0; i < k; i++) {
      p = rot(p)
      n = rot(n)
    }
    return { p, n, c: s.c }
  })
}

export const splitAlg = (alg: string): string[] => alg.trim().split(/\s+/).filter(Boolean)
export const applyAlg = (state: CubeState, alg: string): CubeState => splitAlg(alg).reduce(applyMove, state)

export function invertAlg(alg: string): string {
  return splitAlg(alg)
    .reverse()
    .map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`))
    .join(' ')
}

const faceOfNormal = (n: Vec): Face => FACES.find((f) => NORMALS[f].every((v, i) => v === n[i]))!
const stickerSolved = (s: Sticker) => s.c === faceOfNormal(s.n)

/** The 9 colours of a face as seen from outside, row-major, oriented like a standard net. */
export function faceGrid(state: CubeState, face: Face): Face[] {
  const g = new Array<Face>(9)
  const n = NORMALS[face]
  for (const s of state) {
    if (!s.n.every((v, i) => v === n[i])) continue
    const [x, y, z] = s.p
    const [row, col] = {
      U: [z + 1, x + 1], D: [1 - z, x + 1], F: [1 - y, x + 1],
      B: [1 - y, 1 - x], R: [1 - y, 1 - z], L: [1 - y, z + 1],
    }[face]
    g[row * 3 + col] = s.c
  }
  return g
}

export function stateKey(state: CubeState): string {
  return FACES.map((f) => faceGrid(state, f).join('')).join('')
}

export const isSolved = (state: CubeState) => state.every(stickerSolved)

/** All edges on the given face's layer solved (colour-neutral cross check). */
export function crossSolved(state: CubeState, face: Face): boolean {
  const n = NORMALS[face]
  const axis = n.findIndex((v) => v !== 0)
  return state
    .filter((s) => s.p[axis] === n[axis] && s.p.filter((v) => v !== 0).length === 2)
    .every(stickerSolved)
}

/** First two layers solved relative to `face` (that layer plus the middle layer). */
export function f2lSolved(state: CubeState, face: Face): boolean {
  const n = NORMALS[face]
  const axis = n.findIndex((v) => v !== 0)
  return state.filter((s) => s.p[axis] !== -n[axis]).every(stickerSolved)
}

/** F2L solved and the last layer's face all one colour. */
export function ollSolved(state: CubeState, face: Face): boolean {
  const n = NORMALS[face]
  const axis = n.findIndex((v) => v !== 0)
  return f2lSolved(state, face) && state.filter((s) => s.n[axis] === -n[axis]).every(stickerSolved)
}

const axisOf = (f: Face) => NORMALS[f].findIndex((v) => v !== 0)
const inLayer = (p: Vec, f: Face) => p[axisOf(f)] === NORMALS[f][axisOf(f)]
const isCorner = (p: Vec) => p.every((v) => v !== 0)
const QUARTERS = ['', '', '2', "'"]
const turn = (state: CubeState, f: Face, k: number) => (k ? applyMove(state, f + QUARTERS[k]) : state)

export const opposite = (f: Face): Face => faceOfNormal(NORMALS[f].map((v) => -v) as unknown as Vec)

/** Faces that can sit under a block on `side`: the four around it. */
export const sideFaces = (f: Face): Face[] => FACES.filter((g) => axisOf(g) !== axisOf(f))

/**
 * Quarter turns of `side` that put its 1x2x3 Roux block (the side layer minus the row opposite `bottom`) home,
 * or -1 when the block is not built. Smart cubes report M as turns of both side layers, so a built block can sit turned.
 */
export function blockTurns(state: CubeState, side: Face, bottom: Face): number {
  const top = opposite(bottom)
  for (let k = 0; k < 4; k++) {
    if (turn(state, side, k).every((s) => !inLayer(s.p, side) || inLayer(s.p, top) || stickerSolved(s))) return k
  }
  return -1
}

/** The state with both Roux blocks (on `side` and its opposite, over `bottom`) turned home, or null unless both are built and line up. */
function homeBlocks(state: CubeState, side: Face, bottom: Face): CubeState | null {
  const a = blockTurns(state, side, bottom)
  const b = blockTurns(state, opposite(side), bottom)
  // opposite faces turn the opposite way, so equal offsets add to a whole turn: an M-slice offset, not a broken pair
  if (a < 0 || b < 0 || (a + b) % 4) return null
  return turn(turn(state, side, a), opposite(side), b)
}

export const blocksSolved = (state: CubeState, side: Face, bottom: Face) => homeBlocks(state, side, bottom) !== null

/** Both blocks built and the four top corners solved against them, allowing a turn of the top layer. */
export function cmllSolved(state: CubeState, side: Face, bottom: Face): boolean {
  const home = homeBlocks(state, side, bottom)
  if (!home) return false
  const top = opposite(bottom)
  return [0, 1, 2, 3].some((k) => turn(home, top, k).every((s) => !inLayer(s.p, top) || !isCorner(s.p) || stickerSolved(s)))
}

/** The start state followed by the state after each move. */
export function replay(start: CubeState, moves: readonly { m: string }[]): CubeState[] {
  const states: CubeState[] = [start]
  for (const mv of moves) states.push(applyMove(states[states.length - 1], mv.m))
  return states
}
