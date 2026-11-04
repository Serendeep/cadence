import { useSyncExternalStore } from 'react'
import { VOICES, type Voice } from './voice'

export const THEMES = ['system', 'graphite', 'nord', 'paper', 'matcha', 'mono-light'] as const
export type ThemeName = (typeof THEMES)[number]
export type InputMethod = 'keyboard' | 'stackmat' | 'smartcube' | 'gantimer'
export type TimerUpdate = 'live' | 'seconds' | 'hidden'

export interface Settings {
  theme: ThemeName
  inspection: boolean
  inspectionVoice: Voice
  holdMs: number
  phases: number
  timerUpdate: TimerUpdate
  input: InputMethod
  sessionId: number | null
  decimals: 2 | 3
  scramblePreview: boolean
  /** Opt-in; renamed from `diagnostics`, which defaulted on, so earlier saved values do not carry over */
  shareDiagnostics: boolean
  trackRotations: boolean
  keepAwake: boolean
}

export const DEFAULTS: Settings = {
  theme: 'system',
  inspection: false,
  inspectionVoice: 'male',
  holdMs: 300,
  phases: 1,
  timerUpdate: 'live',
  input: 'keyboard',
  sessionId: null,
  decimals: 2,
  scramblePreview: true,
  shareDiagnostics: false,
  trackRotations: true,
  keepAwake: true,
}

const KEY = 'better-cstimer:settings'
const listeners = new Set<() => void>()

/** Keeps only known keys whose value has the default's type, so a bad localStorage value cannot break the app. */
function sanitize(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULTS
  const src = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = src[k]
    if (k === 'sessionId' ? typeof v === 'number' || v === null : typeof v === typeof DEFAULTS[k]) out[k] = v
  }
  if (!THEMES.includes(out.theme as ThemeName)) out.theme = DEFAULTS.theme
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
