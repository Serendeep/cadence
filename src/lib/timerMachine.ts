import type { Penalty } from './types'

export const INSPECTION_MS = 15000
const INSPECTION_DNF_MS = 17000

export interface TimerConfig {
  inspection: boolean
  /** How long the start key must be held before the timer arms; 0 arms instantly */
  holdMs: number
  /** Number of phases; values > 1 make extra presses record splits instead of stopping */
  phases: number
}

export interface TimerResult {
  time: number
  penalty: Penalty
  splits: number[]
}

export type TimerState =
  | { phase: 'idle' }
  | { phase: 'armInspect' }
  | { phase: 'inspecting'; inspStart: number }
  | { phase: 'holding'; since: number; inspStart?: number }
  | { phase: 'ready'; inspStart?: number }
  | { phase: 'running'; start: number; splits: number[]; penalty: Penalty }
  | { phase: 'stopped'; result: TimerResult }

export type TimerEvent =
  | { type: 'press'; at: number }
  | { type: 'release'; at: number }
  | { type: 'tick'; at: number }
  | { type: 'cancel' }

export const initialTimer: TimerState = { phase: 'idle' }

/** Penalty earned by starting the solve `elapsed` ms into inspection (WCA A3a1 / 10f). */
export function inspectionPenalty(elapsed: number): Penalty {
  if (elapsed > INSPECTION_DNF_MS) return 'dnf'
  if (elapsed > INSPECTION_MS) return '+2'
  return 'ok'
}

function hold(at: number, cfg: TimerConfig, inspStart?: number): TimerState {
  return cfg.holdMs <= 0 ? { phase: 'ready', inspStart } : { phase: 'holding', since: at, inspStart }
}

export function timerReducer(state: TimerState, ev: TimerEvent, cfg: TimerConfig): TimerState {
  if (ev.type === 'cancel') return initialTimer
  switch (state.phase) {
    case 'idle':
      if (ev.type !== 'press') return state
      return cfg.inspection ? { phase: 'armInspect' } : hold(ev.at, cfg)
    case 'armInspect':
      return ev.type === 'release' ? { phase: 'inspecting', inspStart: ev.at } : state
    case 'inspecting':
      return ev.type === 'press' ? hold(ev.at, cfg, state.inspStart) : state
    case 'holding':
      if (ev.type === 'release')
        return state.inspStart != null ? { phase: 'inspecting', inspStart: state.inspStart } : initialTimer
      if (ev.type === 'tick' && ev.at - state.since >= cfg.holdMs) return { phase: 'ready', inspStart: state.inspStart }
      return state
    case 'ready':
      if (ev.type !== 'release') return state
      return {
        phase: 'running',
        start: ev.at,
        splits: [],
        penalty: state.inspStart != null ? inspectionPenalty(ev.at - state.inspStart) : 'ok',
      }
    case 'running': {
      if (ev.type !== 'press') return state
      const elapsed = ev.at - state.start
      if (state.splits.length < cfg.phases - 1) return { ...state, splits: [...state.splits, elapsed] }
      return { phase: 'stopped', result: { time: elapsed, penalty: state.penalty, splits: [...state.splits, elapsed] } }
    }
    case 'stopped':
      return ev.type === 'release' ? initialTimer : state
  }
}

/** True while the UI should hide everything but the time. */
export const isFocused = (s: TimerState) => s.phase !== 'idle' && s.phase !== 'stopped'
