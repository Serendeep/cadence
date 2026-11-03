/**
 * MoYu smart cube drivers, ported from csTimer (https://github.com/cs0x7f/cstimer, GPL-3.0):
 * src/js/hardware/moyu32cube.js (WCU_MY3*: MoYu32 / WeiLong V10 AI, AES encrypted)
 * src/js/hardware/moyucube.js (MHC*: original WeiLong AI, plain).
 */
import aesjs from 'aes-js'
import type { SmartCubeConnection, SmartCubeHandlers } from './devices'

const MY32_SERVICE = '0783b03e-7735-b5a0-1760-a305d2795cb0'
const MY32_READ = '0783b03e-7735-b5a0-1760-a305d2795cb1'
const MY32_WRITE = '0783b03e-7735-b5a0-1760-a305d2795cb2'
const MY32_KEY = [21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87]
const MY32_IV = [17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87]
// Company ids a bound cube may advertise under: 0x0000 when unbound, else the account id's high bytes.
const MY32_CICS = [0, ...Array.from({ length: 255 }, (_, i) => (i + 1) << 8)]

const MHC_UUID = (n: string) => `0000${n}-0000-1000-8000-00805f9b34fb`

/** Asks the user for the cube's MAC address when it cannot be discovered; resolve null to cancel. */
export type MacPrompt = (deviceName: string) => Promise<string | null>

/** GAN-style AES-128 codec: decrypts the last 16 bytes, then the first 16, each XORed with the IV. */
export function makeCodec(mac: string) {
  const bytes = mac.split(/[:-]/).map((h) => parseInt(h, 16))
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) throw new Error(`"${mac}" is not a MAC address.`)
  const key = MY32_KEY.map((k, i) => (i < 6 ? (k + bytes[5 - i]) % 255 : k))
  const iv = MY32_IV.map((k, i) => (i < 6 ? (k + bytes[5 - i]) % 255 : k))
  // ECB on one 16-byte block at a time is a raw AES block operation, which is what the protocol needs
  const aes = new aesjs.ModeOfOperation.ecb(key)
  const xorIv = (b: number[]) => b.map((v, i) => v ^ iv[i])

  return {
    decode(data: Uint8Array): number[] {
      const out = Array.from(data)
      if (out.length > 16) {
        const off = out.length - 16
        out.splice(off, 16, ...xorIv(Array.from(aes.decrypt(out.slice(off)))))
      }
      out.splice(0, 16, ...xorIv(Array.from(aes.decrypt(out.slice(0, 16)))))
      return out
    },
    encode(data: number[]): number[] {
      const out = [...data]
      out.splice(0, 16, ...Array.from(aes.encrypt(xorIv(out.slice(0, 16)))))
      if (out.length > 16) {
        const off = out.length - 16
        out.splice(off, 16, ...Array.from(aes.encrypt(xorIv(out.slice(off)))))
      }
      return out
    },
  }
}

const bitString = (bytes: number[]) => bytes.map((b) => b.toString(2).padStart(8, '0')).join('')
const bits = (s: string, from: number, to: number) => parseInt(s.slice(from, to), 2)

/** Parsed MoYu32 notification. Moves come newest-first with the ms gap before each. */
export type My32Message =
  | { type: 'state'; moveCount: number }
  | { type: 'battery'; level: number }
  | { type: 'moves'; moveCount: number; moves: string[]; gaps: number[] }
  | { type: 'other' }

export function parseMy32(bytes: number[]): My32Message {
  const v = bitString(bytes)
  const type = bits(v, 0, 8)
  if (type === 163) return { type: 'state', moveCount: bits(v, 152, 160) }
  if (type === 164) return { type: 'battery', level: bits(v, 8, 16) }
  if (type !== 165) return { type: 'other' }
  const moves: string[] = []
  const gaps: number[] = []
  for (let i = 0; i < 5; i++) {
    const m = bits(v, 96 + i * 5, 101 + i * 5)
    if (m >= 12) return { type: 'other' }
    moves.push('FBUDLR'[m >> 1] + (m & 1 ? "'" : ''))
    gaps.push(bits(v, 8 + i * 16, 24 + i * 16))
  }
  return { type: 'moves', moveCount: bits(v, 88, 96), moves, gaps }
}

async function macFromAdvertisement(device: BluetoothDevice): Promise<string | null> {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
  // watchAdvertisements exists on Linux/ChromeOS but never fires there
  if (!('watchAdvertisements' in device) || platform === 'Linux' || platform === 'Chrome OS') return null
  const abort = new AbortController()
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => done(null), 10000)
    function done(mac: string | null) {
      window.clearTimeout(timer)
      device.removeEventListener('advertisementreceived', onAdv)
      abort.abort()
      resolve(mac)
    }
    function onAdv(ev: Event) {
      const data = (ev as BluetoothAdvertisingEvent).manufacturerData
      const view = MY32_CICS.map((c) => data?.get(c)).find((d) => d && d.byteLength >= 6)
      if (!view) return
      const mac = Array.from({ length: 6 }, (_, i) => view.getUint8(view.byteLength - i - 1).toString(16).padStart(2, '0'))
      done(mac.join(':'))
    }
    device.addEventListener('advertisementreceived', onAdv)
    device.watchAdvertisements({ signal: abort.signal }).catch(() => done(null))
  })
}

export async function connectMoyu32(h: SmartCubeHandlers, askMac: MacPrompt): Promise<SmartCubeConnection> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'WCU_MY3' }],
    optionalServices: [MY32_SERVICE],
    optionalManufacturerData: MY32_CICS,
  })
  const name = device.name?.trim() ?? 'MoYu cube'
  const fromName = /^WCU_MY32_([0-9A-F]{2})([0-9A-F]{2})$/.exec(name)
  const mac = (await macFromAdvertisement(device)) ?? (fromName ? `CF:30:16:00:${fromName[1]}:${fromName[2]}` : await askMac(name))
  if (!mac) throw new Error('The cube needs its MAC address to decrypt its moves.')
  const codec = makeCodec(mac)

  const gatt = await device.gatt!.connect()
  const service = await gatt.getPrimaryService(MY32_SERVICE)
  const read = await service.getCharacteristic(MY32_READ)
  const write = await service.getCharacteristic(MY32_WRITE)
  const request = (opcode: number) => {
    const req = Array<number>(20).fill(0)
    req[0] = opcode
    return write.writeValue(new Uint8Array(codec.encode(req))).catch(() => undefined)
  }

  let lastCount = -1
  const onData = (ev: Event) => {
    const at = performance.now()
    const value = (ev.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const msg = parseMy32(codec.decode(new Uint8Array(value.buffer)))
    if (msg.type === 'state' && lastCount === -1) lastCount = msg.moveCount
    else if (msg.type === 'battery') h.onBattery?.(msg.level)
    else if (msg.type === 'moves' && lastCount !== -1 && msg.moveCount !== lastCount) {
      // several moves can arrive in one packet after a dropped notification; replay oldest first
      const n = Math.min((msg.moveCount - lastCount) & 0xff, msg.moves.length)
      lastCount = msg.moveCount
      let t = at
      const stamped = msg.moves.slice(0, n).map((m, i) => {
        const stamp = { m, t }
        t -= msg.gaps[i]
        return stamp
      })
      stamped.reverse().forEach((s) => h.onMove(s.m, s.t))
    }
  }
  read.addEventListener('characteristicvaluechanged', onData)
  await read.startNotifications()
  device.addEventListener('gattserverdisconnected', h.onDisconnect)
  await request(161)
  await request(163)
  await request(164)

  return {
    name,
    markSolved: () => undefined,
    disconnect: () => {
      read.removeEventListener('characteristicvaluechanged', onData)
      gatt.disconnect()
    },
  }
}

/** Old MoYu WeiLong AI: each face reports rotation in ninths of a turn; a move is a crossing of the halfway mark. */
export async function connectMoyuClassic(h: SmartCubeHandlers): Promise<SmartCubeConnection> {
  const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'MHC' }], optionalServices: [MHC_UUID('1000')] })
  const gatt = await device.gatt!.connect()
  const service = await gatt.getPrimaryService(MHC_UUID('1000'))
  const turn = await service.getCharacteristic(MHC_UUID('1003'))
  const faceStatus = [0, 0, 0, 0, 0, 0]
  const onTurn = (ev: Event) => {
    const data = (ev.target as BluetoothRemoteGATTCharacteristic).value
    if (!data || data.byteLength < 1) return
    const n = data.getUint8(0)
    if (data.byteLength < 1 + n * 6) return
    for (let i = 0; i < n; i++) {
      const off = 1 + i * 6
      const face = data.getUint8(off + 4)
      const dir = Math.round(data.getUint8(off + 5) / 36)
      const prev = faceStatus[face]
      const cur = prev + dir
      faceStatus[face] = (cur + 9) % 9
      const axis = 'URFDLB'[[3, 4, 5, 1, 2, 0][face]]
      if (prev >= 5 && cur <= 4) h.onMove(`${axis}'`, performance.now())
      else if (prev <= 4 && cur >= 5) h.onMove(axis, performance.now())
    }
  }
  turn.addEventListener('characteristicvaluechanged', onTurn)
  await turn.startNotifications()
  device.addEventListener('gattserverdisconnected', h.onDisconnect)
  return {
    name: device.name ?? 'MoYu WeiLong AI',
    markSolved: () => {
      faceStatus.fill(0)
    },
    disconnect: () => {
      turn.removeEventListener('characteristicvaluechanged', onTurn)
      gatt.disconnect()
    },
  }
}
