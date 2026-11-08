import { ganToScreen, normalize, type Quat } from './orientation'
import type { StackmatStatus } from './stackmat'

export interface SmartCubeHandlers {
  onMove: (move: string, at: number) => void
  onBattery?: (percent: number) => void
  /** Cube orientation in screen axes; `raw` is the sensor's own reading, for diagnostics */
  onOrientation?: (q: Quat, raw: Quat) => void
  /** Whether the user wants orientation streamed (costs cube battery) */
  gyro?: boolean
  onDisconnect: () => void
}

export interface SmartCubeConnection {
  name: string
  /** The chosen device, so a dropped connection can be reopened without the chooser; absent where the driver cannot reuse it */
  device?: BluetoothDevice
  /** Tell the cube its current state is solved (GAN only); a no-op where unsupported */
  markSolved: () => void
  disconnect: () => void
}

export const bluetoothAvailable = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator

export async function connectGan(h: SmartCubeHandlers): Promise<SmartCubeConnection> {
  const { connectGanCube } = await import('gan-web-bluetooth')
  const conn = await connectGanCube()
  const sub = conn.events$.subscribe((ev) => {
    if (ev.type === 'MOVE') h.onMove(ev.move, ev.localTimestamp ?? performance.now())
    else if (ev.type === 'BATTERY') h.onBattery?.(ev.batteryLevel)
    else if (ev.type === 'GYRO' && h.gyro) h.onOrientation?.(ganToScreen(normalize(ev.quaternion)), ev.quaternion)
    else if (ev.type === 'DISCONNECT') h.onDisconnect()
  })
  conn.sendCubeCommand({ type: 'REQUEST_BATTERY' }).catch(() => undefined)
  return {
    name: conn.deviceName,
    markSolved: () => void conn.sendCubeCommand({ type: 'REQUEST_RESET' }).catch(() => undefined),
    disconnect: () => {
      sub.unsubscribe()
      void conn.disconnect()
    },
  }
}

/** GiiKER, GoCube and older GAN models through cubing.js. */
export async function connectOtherCube(h: SmartCubeHandlers): Promise<SmartCubeConnection> {
  const { connectSmartPuzzle } = await import('cubing/bluetooth')
  const puzzle = await connectSmartPuzzle()
  puzzle.addAlgLeafListener((e) => h.onMove(e.latestAlgLeaf.toString(), performance.now()))
  return {
    name: puzzle.name() ?? 'Smart cube',
    markSolved: () => undefined,
    disconnect: () => {
      puzzle.disconnect()
      h.onDisconnect()
    },
  }
}

export interface ExternalTimerHandlers {
  onStatus: (status: StackmatStatus, time: number) => void
  onDisconnect: () => void
}

export interface ExternalTimerConnection {
  name: string
  disconnect: () => void
}

export async function connectGanTimer(h: ExternalTimerHandlers): Promise<ExternalTimerConnection> {
  const { connectGanTimerDevice } = await import('./ganTimer')
  return connectGanTimerDevice((ev) => h.onStatus(ev.status, ev.time), h.onDisconnect)
}

const WORKLET = `class Tap extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('stackmat-tap',Tap)`

/** Listens to a Stackmat on the microphone / line-in and reports decoded packets. */
export async function connectStackmat(h: ExternalTimerHandlers, deviceId?: string): Promise<ExternalTimerConnection> {
  const { StackmatDecoder } = await import('./stackmat')
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ctx = new AudioContext()
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)
  const source = ctx.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(ctx, 'stackmat-tap')
  const decoder = new StackmatDecoder(ctx.sampleRate)
  let last = ''
  let lastSeen = performance.now()
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    for (const p of decoder.push(e.data)) {
      lastSeen = performance.now()
      const key = `${p.status}:${p.time}`
      if (key !== last) h.onStatus(p.status, p.time)
      last = key
    }
  }
  source.connect(node)
  // packets arrive ~5 times a second; silence for 3s means the timer was switched off or unplugged
  const watchdog = window.setInterval(() => {
    if (performance.now() - lastSeen > 3000 && last !== '') {
      last = ''
      h.onStatus('idle', 0)
    }
  }, 1000)
  return {
    name: 'Stackmat',
    disconnect: () => {
      window.clearInterval(watchdog)
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
      h.onDisconnect()
    },
  }
}

/** Waits before each reconnect attempt: three tries over about ten seconds. */
export const RECONNECT_DELAYS_MS = [1000, 3000, 6000]

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/** Tries `attempt` after each delay in turn; gives the first success, or null once every try fails or `stop()` turns true. */
export async function retryWithBackoff<T>(
  attempt: () => Promise<T>,
  delays: readonly number[],
  stop: () => boolean,
  onError: (e: unknown, tryNo: number) => void,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T | null> {
  for (const [i, ms] of delays.entries()) {
    await wait(ms)
    if (stop()) return null
    try {
      return await attempt()
    } catch (e) {
      onError(e, i + 1)
    }
  }
  return null
}

export function errorMessage(e: unknown): string {
  if (e instanceof DOMException && e.name === 'NotFoundError') return 'No device was chosen.'
  if (e instanceof DOMException && e.name === 'NotAllowedError') return 'Permission was denied.'
  if (e instanceof DOMException && e.name === 'NetworkError')
    return 'The device did not accept the connection. Turn it off and on, keep it close, and try again.'
  return e instanceof Error ? e.message : 'Something went wrong while connecting.'
}
