import { useSyncExternalStore } from 'react'
import {
  connectGan, connectGanTimer, connectOtherCube, connectStackmat, errorMessage, RECONNECT_DELAYS_MS, retryWithBackoff,
  type ExternalTimerConnection, type SmartCubeConnection, type SmartCubeHandlers,
} from './devices'
import { diag } from './diag'
import { relativeTo, type Quat } from './orientation'
import { getSettings } from './settings'
import { whenNotSolving } from './solving'
import { toast } from './toast'
import type { MacRequest } from './moyu'
import type { StackmatStatus } from './stackmat'

export type CubeKind = 'gan' | 'moyu32' | 'moyu' | 'other'
export type ExternalKind = 'stackmat' | 'gantimer'

/** Set while a dropped cube is being reconnected, or after that failed while a solve still needs the lab */
export type CubeLink = 'reconnecting' | 'lost'

export interface DeviceState {
  cube: { name: string; battery: number | null; link?: CubeLink } | null
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
// bumped on every connect, drop and disconnect, so stale disconnect events and late reconnects are ignored
let cubeGen = 0
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

async function openCube(kind: CubeKind, gen: number, device?: BluetoothDevice): Promise<SmartCubeConnection> {
  const handlers: SmartCubeHandlers = {
    onMove: (m, at) => moveListeners.forEach((l) => l(m, at)),
    onBattery: (b) => state.cube && set({ cube: { ...state.cube, battery: b } }),
    onOrientation,
    gyro: getSettings().trackRotations,
    onDisconnect: () => {
      if (gen === cubeGen) void cubeDropped(kind)
    },
  }
  if (kind === 'gan') return connectGan(handlers)
  if (kind === 'other') return connectOtherCube(handlers)
  const moyu = await import('./moyu')
  return kind === 'moyu32' ? moyu.connectMoyu32(handlers, askMac, device) : moyu.connectMoyuClassic(handlers, device)
}

/** An unexpected drop: reopen the same device a few times, then give up. */
async function cubeDropped(kind: CubeKind): Promise<void> {
  const gen = ++cubeGen
  const device = cubeConn?.device
  cubeConn = null
  diag('device.dropped', { kind, retry: device != null }, 'warn')
  if (!state.cube) return
  if (!device) {
    toast('Cube disconnected. Choose the cube again.')
    return cubeLost(gen)
  }
  set({ cube: { ...state.cube, link: 'reconnecting' } })
  toast('Cube disconnected. Reconnecting…', undefined, 15000)
  const conn = await retryWithBackoff(
    () => openCube(kind, gen, device),
    RECONNECT_DELAYS_MS,
    () => gen !== cubeGen,
    (e, attempt) => diag('device.reconnect.failed', { kind, attempt, error: e }, 'warn'),
  )
  if (gen !== cubeGen) return conn?.disconnect()
  if (!conn) {
    toast('Could not reconnect. Choose the cube again.', undefined, 8000)
    return cubeLost(gen)
  }
  cubeConn = conn
  set({ cube: { name: conn.name, battery: state.cube?.battery ?? null } })
  toast('Cube reconnected')
  diag('device.reconnected', { kind, name: conn.name })
}

// the lab stays open until a paused solve is finished or discarded, so its moves are not thrown away
function cubeLost(gen: number): void {
  if (state.cube) set({ cube: { ...state.cube, link: 'lost' } })
  whenNotSolving(() => gen === cubeGen && set({ cube: null }))
}

export async function connectCube(kind: CubeKind): Promise<void> {
  disconnectCube()
  const gen = cubeGen
  set({ connecting: LABELS[kind], error: null })
  resetCubeOrientation()
  try {
    cubeConn = await openCube(kind, gen)
    set({ cube: { name: cubeConn.name, battery: null }, connecting: null })
    diag('device.connected', { kind, name: cubeConn.name })
  } catch (e) {
    diag('device.connect.failed', { kind, error: e }, 'error')
    set({ connecting: null, error: `Could not connect the ${LABELS[kind]}: ${errorMessage(e)}` })
  }
}

export function disconnectCube(): void {
  cubeGen++
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
