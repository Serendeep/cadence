export type Penalty = 'ok' | '+2' | 'dnf'

export type InputSource = 'keyboard' | 'touch' | 'stackmat' | 'smartcube' | 'gantimer' | 'import'

export interface TimedMove {
  /** Move in WCA notation, e.g. "R'" */
  m: string
  /** Milliseconds since the solve started */
  t: number
}

export interface Solve {
  id?: number
  sessionId: number
  /** Raw time in milliseconds, before any penalty */
  time: number
  penalty: Penalty
  scramble: string
  event: string
  /** Epoch milliseconds when the solve finished */
  date: number
  comment?: string
  /** Cumulative phase end times in ms; the last entry equals `time` */
  splits?: number[]
  moves?: TimedMove[]
  /** Whole-cube rotations (x, y', z2…) from a gyroscope cube, kept apart from moves so move counts and TPS stay pure */
  rotations?: TimedMove[]
  source?: InputSource
}

export interface Session {
  id?: number
  name: string
  event: string
  created: number
  order: number
}
