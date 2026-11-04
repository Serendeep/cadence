/**
 * GAN Smart Timer over Web Bluetooth, after csTimer's src/js/hardware/gantimer.js (GPL-3.0).
 * Only the state characteristic is used: some timers lack the recorded-times one that gan-web-bluetooth requires.
 */
import { diag } from './diag'
import type { StackmatStatus } from './stackmat'

const SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb'
const STATE = '0000fff5-0000-1000-8000-00805f9b34fb'
// Android often refuses the first GATT connection right after the chooser closes
const CONNECT_ATTEMPTS = 3
const RETRY_DELAY_MS = 600

// state byte values sent by the timer; 7 (finished, right after stop) and 8 (inspection) carry nothing the timer view needs
const STATUS: Partial<Record<number, StackmatStatus>> = { 1: 'ready', 2: 'idle', 3: 'running', 4: 'stopped', 5: 'idle', 6: 'both' }

const IGNORED_STATES = new Set([7, 8])

export interface GanTimerEvent {
  status: StackmatStatus
  /** Final time in ms; only set when the timer stops */
  time: number
}

/** Parses one state notification; null for malformed packets and for states the timer view does not use. */
export function parseGanTimer(data: DataView): GanTimerEvent | null {
  // Structure check instead of the CRC: some timers (GAN-728AC1) send time packets whose CRC matches no
  // CRC-16 variant, and csTimer accepts them too. 0xFE, then the byte count after these two header bytes.
  if (data.byteLength < 4 || data.getUint8(0) !== 0xfe || data.getUint8(1) !== data.byteLength - 2) return null
  const status = STATUS[data.getUint8(3)]
  if (!status) return null
  const time = status === 'stopped' && data.byteLength >= 10 ? data.getUint8(4) * 60000 + data.getUint8(5) * 1000 + data.getUint16(6, true) : 0
  return { status, time }
}

async function connectWithRetry(device: BluetoothDevice): Promise<BluetoothRemoteGATTServer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await device.gatt!.connect()
    } catch (e) {
      if (attempt >= CONNECT_ATTEMPTS) throw e
      console.warn(`GAN timer connection attempt ${attempt} failed, retrying`, e)
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }
  }
}

export async function connectGanTimerDevice(onEvent: (ev: GanTimerEvent) => void, onDisconnect: () => void) {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'GAN' }, { namePrefix: 'Gan' }, { namePrefix: 'gan' }, { services: [SERVICE] }],
    optionalServices: [SERVICE],
  })
  diag('gantimer.picked', { name: device.name })
  const gatt = await connectWithRetry(device)
  diag('gantimer.gatt.connected')
  const service = await gatt.getPrimaryService(SERVICE)
  diag('gantimer.service.found', { characteristics: (await service.getCharacteristics()).map((c) => c.uuid) })
  const state = await service.getCharacteristic(STATE)
  const onValue = (e: Event) => {
    const value = (e.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const ev = parseGanTimer(value)
    if (ev) onEvent(ev)
    else if (!IGNORED_STATES.has(value.getUint8(3))) console.warn('Ignored an unreadable GAN timer packet', Array.from(new Uint8Array(value.buffer)))
  }
  state.addEventListener('characteristicvaluechanged', onValue)
  await state.startNotifications()
  diag('gantimer.notifications.started')
  device.addEventListener('gattserverdisconnected', onDisconnect)
  return {
    name: device.name?.trim() || 'GAN Smart Timer',
    disconnect: () => {
      device.removeEventListener('gattserverdisconnected', onDisconnect)
      state.removeEventListener('characteristicvaluechanged', onValue)
      gatt.disconnect()
    },
  }
}
