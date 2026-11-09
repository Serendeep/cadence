import { useSyncExternalStore } from 'react'
import { METHODS, type Method } from './cfop'
import { DRILLS, type FindingKind } from './coach'
import { DRILL_KINDS, type DrillKind } from './types'
import { VOICES, type Voice } from './voice'

const THEMES = ['system', 'graphite', 'nord', 'paper', 'matcha', 'mono-light'] as const
export type ThemeName = (typeof THEMES)[number]
export type InputMethod = 'keyboard' | 'typing' | 'stackmat' | 'smartcube' | 'gantimer'
export type TimerUpdate = 'live' | 'seconds' | 'hidden'

/** The finding the solver chose to work on, with its metric when they started, so Coach can show before and after. */
export interface CoachFocus {
  kind: FindingKind
  event: string
  since: number
  baseline: number
}

/** A guided drill in progress on this device. */
export interface DrillMode {
  kind: DrillKind
  /** The drill session its solves go to */
  sessionId: number
  /** The session to go back to when the drill ends */
  returnTo: number | null
  /** OLL or PLL cases to practise; null means all */
  cases: string[] | null
}

export interface Settings {
  theme: ThemeName
  inspection: boolean
  inspectionVoice: Voice
  holdMs: number
  /** Names the four phases and picks how a smart cube splits them */
  method: Method
  timerUpdate: TimerUpdate
  input: InputMethod
  sessionId: number | null
  decimals: 2 | 3
  scramblePreview: boolean
  /** Opt-in; renamed from `diagnostics`, which defaulted on, so earlier saved values do not carry over */
  shareDiagnostics: boolean
  trackRotations: boolean
  keepAwake: boolean
  coach: boolean
  coachFocus: CoachFocus | null
  drill: DrillMode | null
  /** Whether the timer's side panel shows the open session or every session of its event */
  sideScope: 'session' | 'event'
}

const DEFAULTS: Settings = {
  theme: 'system',
  inspection: false,
  inspectionVoice: 'male',
  holdMs: 300,
  method: 'cfop',
  timerUpdate: 'live',
  input: 'keyboard',
  sessionId: null,
  decimals: 2,
  scramblePreview: true,
  shareDiagnostics: false,
  trackRotations: true,
  keepAwake: true,
  coach: false,
  coachFocus: null,
  drill: null,
  sideScope: 'session',
}

const KEY = 'better-cstimer:settings'
const listeners = new Set<() => void>()

function isCoachFocus(v: unknown): v is CoachFocus {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  return typeof f.kind === 'string' && Object.hasOwn(DRILLS, f.kind) && typeof f.event === 'string' && typeof f.since === 'number' && typeof f.baseline === 'number'
}

function isDrillMode(v: unknown): v is DrillMode {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  return DRILL_KINDS.includes(d.kind as DrillKind) && typeof d.sessionId === 'number' && (typeof d.returnTo === 'number' || d.returnTo === null)
    && (d.cases === null || (Array.isArray(d.cases) && d.cases.every((c) => typeof c === 'string')))
}

/** Keeps only known keys whose value has the default's type, so a bad localStorage value cannot break the app. */
function sanitize(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULTS
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = src[k]
    if (k === 'sessionId' ? typeof v === 'number' || v === null : typeof v === typeof DEFAULTS[k]) out[k] = v
  }
  if (!isCoachFocus(out.coachFocus)) out.coachFocus = null
  if (!isDrillMode(out.drill)) out.drill = null
  if (out.sideScope !== 'event') out.sideScope = 'session'
  if (!THEMES.includes(out.theme as ThemeName)) out.theme = DEFAULTS.theme
  if (!METHODS.includes(out.method as Method)) out.method = DEFAULTS.method
  // older versions stored an on/off switch
  if (src.inspectionVoice === false) out.inspectionVoice = 'off'
  if (!VOICES.includes(out.inspectionVoice as Voice)) out.inspectionVoice = DEFAULTS.inspectionVoice
  out.holdMs = Math.min(2000, Math.max(0, out.holdMs as number))
  return out as unknown as Settings
}

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? sanitize(JSON.parse(raw)) : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

let current = read()

export function getSettings(): Settings {
  return current
}

export function setSettings(patch: Partial<Settings>): void {
  current = sanitize({ ...current, ...patch })
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // private mode or full storage: settings still apply for this visit
  }
  listeners.forEach((l) => l())
}

/** Calls `l` after every settings change; returns the unsubscribe. */
export function subscribeSettings(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSettings,
  )
}
