import { useSyncExternalStore } from 'react'
import {
  connectGan, connectGanTimer, connectOtherCube, connectStackmat, errorMessage,
  type ExternalTimerConnection, type SmartCubeConnection, type SmartCubeHandlers,
} from './devices'
import { diag } from './diag'
import { relativeTo, type Quat } from './orientation'
import { getSettings } from './settings'
import type { MacRequest } from './moyu'
import type { StackmatStatus } from './stackmat'

export type CubeKind = 'gan' | 'moyu32' | 'moyu' | 'other'
export type ExternalKind = 'stackmat' | 'gantimer'

export interface DeviceState {
  cube: { name: string; battery: number | null } | null
  external: { name: string; kind: ExternalKind } | null
  connecting: string | null
  error: string | null
  /** Set while a MoYu cube waits for the user to type its MAC address */
  macRequest: MacRequest | null
}

type MoveListener = (move: string, at: number) => void
type StatusListener = (status: StackmatStatus, time: number) => void
type OrientationListener = (q: Quat) => void

let state: DeviceState = { cube: null, external: null, connecting: null, error: null, macRequest: null }
const listeners = new Set<() => void>()
const moveListeners = new Set<MoveListener>()
const statusListeners = new Set<StatusListener>()
const orientationListeners = new Set<OrientationListener>()
// home is the first reading after connecting or resetting, taken as white up, green front
let home: Quat | null = null
let rawSamplesLeft = 0
let lastRawSample = 0
// a handful of raw sensor readings after each reset, spaced out, so axis mix-ups can be read from the log
const RAW_SAMPLES = 6
const RAW_SAMPLE_GAP_MS = 1500
let cubeConn: SmartCubeConnection | null = null
let extConn: ExternalTimerConnection | null = null
let macResolve: ((mac: string | null) => void) | null = null

function set(patch: Partial<DeviceState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

// dev only: lets layout checks fake a connected device; stripped from production builds
if (import.meta.env.DEV) Object.assign(window, { __devices: { set, orient: (q: Quat) => onOrientation(q, q), move: (m: string) => moveListeners.forEach((l) => l(m, performance.now())) } })

export const useDevices = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)

export function onCubeMove(l: MoveListener): () => void {
  moveListeners.add(l)
  return () => moveListeners.delete(l)
}
export function onCubeOrientation(l: OrientationListener): () => void {
  orientationListeners.add(l)
  return () => orientationListeners.delete(l)
}

/** Takes the cube's current orientation as home (white up, green front). */
export function resetCubeOrientation(): void {
  home = null
  rawSamplesLeft = RAW_SAMPLES
}

function onOrientation(q: Quat, raw: Quat): void {
  home ??= q
  const now = performance.now()
  if (rawSamplesLeft > 0 && now - lastRawSample > RAW_SAMPLE_GAP_MS) {
    rawSamplesLeft--
    lastRawSample = now
    const r = (v: number) => Math.round(v * 1000) / 1000
    diag('cube.orientation.raw', { x: r(raw.x), y: r(raw.y), z: r(raw.z), w: r(raw.w) })
  }
  const rel = relativeTo(home, q)
  orientationListeners.forEach((l) => l(rel))
}

export function onTimerStatus(l: StatusListener): () => void {
  statusListeners.add(l)
  return () => statusListeners.delete(l)
}

const LABELS: Record<CubeKind | ExternalKind, string> = {
  gan: 'GAN cube', moyu32: 'MoYu cube', moyu: 'MoYu WeiLong AI', other: 'smart cube', stackmat: 'Stackmat', gantimer: 'GAN timer',
}

function askMac(req: MacRequest): Promise<string | null> {
  return new Promise((resolve) => {
    macResolve = resolve
    set({ macRequest: req })
  })
}

export function answerMac(mac: string | null): void {
  macResolve?.(mac)
  macResolve = null
  set({ macRequest: null })
}

export async function connectCube(kind: CubeKind): Promise<void> {
  disconnectCube()
  set({ connecting: LABELS[kind], error: null })
  const handlers: SmartCubeHandlers = {
    onMove: (m, at) => moveListeners.forEach((l) => l(m, at)),
    onBattery: (b) => state.cube && set({ cube: { ...state.cube, battery: b } }),
    onOrientation,
    gyro: getSettings().trackRotations,
    onDisconnect: () => {
      cubeConn = null
      set({ cube: null })
    },
  }
  resetCubeOrientation()
  try {
    if (kind === 'gan') cubeConn = await connectGan(handlers)
    else if (kind === 'other') cubeConn = await connectOtherCube(handlers)
    else {
      const moyu = await import('./moyu')
      cubeConn = kind === 'moyu32' ? await moyu.connectMoyu32(handlers, askMac) : await moyu.connectMoyuClassic(handlers)
    }
    set({ cube: { name: cubeConn.name, battery: null }, connecting: null })
    diag('device.connected', { kind, name: cubeConn.name })
  } catch (e) {
    diag('device.connect.failed', { kind, error: e }, 'error')
    set({ connecting: null, error: `Could not connect the ${LABELS[kind]}: ${errorMessage(e)}` })
  }
}

export function disconnectCube(): void {
  cubeConn?.disconnect()
  cubeConn = null
  if (state.cube) set({ cube: null })
}

export const markCubeSolved = () => cubeConn?.markSolved()

export async function connectExternal(kind: ExternalKind): Promise<void> {
  disconnectExternal()
  set({ connecting: LABELS[kind], error: null })
  const handlers = {
    onStatus: (s: StackmatStatus, t: number) => statusListeners.forEach((l) => l(s, t)),
    onDisconnect: () => {
      extConn = null
      set({ external: null })
    },
  }
  try {
    extConn = kind === 'stackmat' ? await connectStackmat(handlers) : await connectGanTimer(handlers)
    set({ external: { name: extConn.name, kind }, connecting: null })
    diag('device.connected', { kind, name: extConn.name })
  } catch (e) {
    diag('device.connect.failed', { kind, error: e }, 'error')
    set({ connecting: null, error: `Could not connect the ${LABELS[kind]}: ${errorMessage(e)}` })
  }
}

export function disconnectExternal(): void {
  extConn?.disconnect()
  extConn = null
  if (state.external) set({ external: null })
}

export const clearDeviceError = () => set({ error: null })
