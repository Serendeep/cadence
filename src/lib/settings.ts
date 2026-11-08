import { useSyncExternalStore } from 'react'
import { METHODS, type Method } from './cfop'
import { DRILLS, type FindingKind } from './coach'
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

export interface Settings {
  theme: ThemeName
  inspection: boolean
  inspectionVoice: Voice
  holdMs: number
  phases: number
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
}

const DEFAULTS: Settings = {
  theme: 'system',
  inspection: false,
  inspectionVoice: 'male',
  holdMs: 300,
  phases: 1,
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
}

const KEY = 'better-cstimer:settings'
const listeners = new Set<() => void>()

function isCoachFocus(v: unknown): v is CoachFocus {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  return typeof f.kind === 'string' && Object.hasOwn(DRILLS, f.kind) && typeof f.event === 'string' && typeof f.since === 'number' && typeof f.baseline === 'number'
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
  if (!THEMES.includes(out.theme as ThemeName)) out.theme = DEFAULTS.theme
  if (!METHODS.includes(out.method as Method)) out.method = DEFAULTS.method
  // older versions stored an on/off switch
  if (src.inspectionVoice === false) out.inspectionVoice = 'off'
  if (!VOICES.includes(out.inspectionVoice as Voice)) out.inspectionVoice = DEFAULTS.inspectionVoice
  out.phases = Math.min(8, Math.max(1, Math.round(out.phases as number)))
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
