import type { Method } from './cfop'

export type Penalty = 'ok' | '+2' | 'dnf'

export type InputSource = 'keyboard' | 'touch' | 'stackmat' | 'smartcube' | 'gantimer' | 'typing' | 'import'

export const DRILL_KINDS = ['f2l', 'lsll', 'oll', 'pll'] as const
export type DrillKind = (typeof DRILL_KINDS)[number]

export interface TimedMove {
  /** Move in WCA notation, e.g. "R'" */
  m: string
  /** Milliseconds since the solve started */
  t: number
}

/** Fields every synced row carries; the database fills them in on write. */
export interface Synced {
  /** Stable id shared by every device; the numeric `id` is local to one browser */
  uid?: string
  /** Epoch ms of the last edit on any device; the newest edit wins when devices disagree */
  updated?: number
}

export interface Solve extends Synced {
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
  /** Method the four splits belong to; missing means CFOP */
  method?: Method
  moves?: TimedMove[]
  /** Whole-cube rotations (x, y', z2…) from a gyroscope cube, kept apart from moves so move counts and TPS stay pure */
  rotations?: TimedMove[]
  source?: InputSource
  /** Set on practice solves from a guided drill; they stay out of statistics and Coach */
  drill?: DrillKind
}

export interface Session extends Synced {
  id?: number
  name: string
  event: string
  created: number
  order: number
  /** Hidden from the session menu unless it is the one open */
  archived?: boolean
}
