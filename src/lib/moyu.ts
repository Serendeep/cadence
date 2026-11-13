/**
 * MoYu smart cube drivers, ported from csTimer (https://github.com/cs0x7f/cstimer, GPL-3.0):
 * src/js/hardware/moyu32cube.js (WCU_MY3*: MoYu32 / WeiLong V10 AI, AES encrypted)
 * src/js/hardware/moyucube.js (MHC*: original WeiLong AI, plain).
 */
import aesjs from 'aes-js'
import { advertisementsNeverFire, type SmartCubeConnection, type SmartCubeHandlers } from './devices'
import { moyuToScreen, type Quat } from './orientation'
import { diag } from './diag'

const MY32_SERVICE = '0783b03e-7735-b5a0-1760-a305d2795cb0'
const MY32_READ = '0783b03e-7735-b5a0-1760-a305d2795cb1'
const MY32_WRITE = '0783b03e-7735-b5a0-1760-a305d2795cb2'
const MY32_KEY = [21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87]
const MY32_IV = [17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87]
// Company ids a bound cube may advertise under: 0x0000 when unbound, else the account id's high bytes.
const MY32_CICS = [0, ...Array.from({ length: 255 }, (_, i) => (i + 1) << 8)]

const MHC_UUID = (n: string) => `0000${n}-0000-1000-8000-00805f9b34fb`

/** `suggested` prefills the field; `failed` is an address the cube did not answer to. */
export interface MacRequest {
  deviceName: string
  suggested?: string
  failed?: string
  /** The browser hides advertisements, the reliable source of the address, until its experimental features are on */
  advertisementsOff?: boolean
}

// addresses that completed a handshake, by cube name, so later connections skip the guessing
const MAC_STORE = 'cadence:moyu-macs'

function rememberedMacs(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MAC_STORE) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function rememberMac(name: string, mac: string): void {
  try {
    localStorage.setItem(MAC_STORE, JSON.stringify({ ...rememberedMacs(), [name]: mac }))
  } catch {
    // storage blocked: the next connection finds the address the same way again
  }
}

/** Asks the user for the cube's MAC address when it cannot be discovered; resolve null to cancel. */
export type MacPrompt = (req: MacRequest) => Promise<string | null>

// message types a correctly decrypted packet starts with: info, state, battery, move, gyro, gyro ack
const MY32_TYPES = new Set([161, 163, 164, 165, 171, 172])
// how long the cube gets to answer our first requests before the address is presumed wrong
const MY32_ANSWER_MS = 3000
const MY32_HANDSHAKE_TRIES = 4

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
  | { type: 'gyro'; q: Quat }
  | { type: 'other' }

export function parseMy32(bytes: number[]): My32Message {
  const v = bitString(bytes)
  const type = bits(v, 0, 8)
  if (type === 163) return { type: 'state', moveCount: bits(v, 152, 160) }
  if (type === 164) return { type: 'battery', level: bits(v, 8, 16) }
  if (type === 171) {
    // four little-endian int32 at bytes 1..16 in the order (w, x, -z, y), each scaled by 2^30
    // (github.com/lukeburong/weilong-v10-ai-protocol); not cross-checked against a second source
    const i32 = (k: number) => new DataView(Uint8Array.from(bytes.slice(1 + k * 4, 5 + k * 4)).buffer).getInt32(0, true) / 2 ** 30
    return { type: 'gyro', q: { w: i32(0), x: i32(1), z: -i32(2), y: i32(3) } }
  }
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

/** The address is the last 6 bytes of the manufacturer data, in reverse order. */
async function macFromAdvertisement(device: BluetoothDevice): Promise<string | null> {
  if (!('watchAdvertisements' in device) || advertisementsNeverFire()) return null
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

export async function connectMoyu32(h: SmartCubeHandlers, askMac: MacPrompt, chosen?: BluetoothDevice): Promise<SmartCubeConnection> {
  const device = chosen ?? await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'WCU_MY3' }],
    optionalServices: [MY32_SERVICE],
    optionalManufacturerData: MY32_CICS,
  })
  const name = device.name?.trim() ?? 'MoYu cube'
  const fromName = /^WCU_MY32_([0-9A-F]{2})([0-9A-F]{2})$/.exec(name)
  // shortcut: the name only gives the last two bytes; the rest is the usual MoYu prefix, corrected by the prompt below if wrong
  const guess = fromName ? `CF:30:16:00:${fromName[1]}:${fromName[2]}` : undefined
  const advertisementsOff = !('watchAdvertisements' in device) && !advertisementsNeverFire()
  const advertised = await macFromAdvertisement(device)
  const remembered = rememberedMacs()[name]
  diag('moyu32.mac', { name, source: advertised ? 'advertisement' : remembered ? 'remembered' : guess ? 'name' : 'prompt' })
  let mac = advertised ?? remembered ?? guess ?? (await askMac({ deviceName: name, advertisementsOff }))
  if (!mac) throw new Error('The cube needs its MAC address to decrypt its moves.')
  let codec = makeCodec(mac)

  const gatt = await device.gatt!.connect()
  const service = await gatt.getPrimaryService(MY32_SERVICE)
  const read = await service.getCharacteristic(MY32_READ)
  const write = await service.getCharacteristic(MY32_WRITE)
  const request = (opcode: number, payload: number[] = []) => {
    const req = Array<number>(20).fill(0)
    req[0] = opcode
    payload.forEach((b, i) => (req[1 + i] = b))
    return write.writeValue(new Uint8Array(codec.encode(req))).catch((e: unknown) => console.warn(`MoYu request ${opcode} failed`, e))
  }

  let lastCount = -1
  let understood = false
  let onUnderstood = () => {}
  const onData = (ev: Event) => {
    const at = performance.now()
    const value = (ev.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const bytes = codec.decode(new Uint8Array(value.buffer))
    // a wrong address decrypts to noise; drop it rather than reading noise as moves
    if (!MY32_TYPES.has(bytes[0])) return
    if (!understood) {
      understood = true
      onUnderstood()
    }
    const msg = parseMy32(bytes)
    if (msg.type === 'state' && lastCount === -1) lastCount = msg.moveCount
    else if (msg.type === 'battery') h.onBattery?.(msg.level)
    else if (msg.type === 'gyro') h.onOrientation?.(moyuToScreen(msg.q), msg.q)
    else if (msg.type === 'moves' && msg.moveCount !== lastCount) {
      // several moves can arrive in one packet after a dropped notification; replay oldest first.
      // Without a state reply there is no previous count, so only the newest move is certain.
      const missed = lastCount === -1 ? 0 : (msg.moveCount - lastCount) & 0xff
      if (missed > msg.moves.length) diag('moyu32.moves.lost', { lost: missed - msg.moves.length }, 'warn')
      const n = lastCount === -1 ? 1 : Math.min(missed, msg.moves.length)
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
  const disconnect = () => {
    read.removeEventListener('characteristicvaluechanged', onData)
    gatt.disconnect()
  }

  /** Sends the opening requests and reports whether anything decrypted correctly in reply. */
  const handshake = () =>
    new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(understood), MY32_ANSWER_MS)
      onUnderstood = () => {
        window.clearTimeout(timer)
        resolve(true)
      }
      void request(161).then(() => request(163)).then(() => request(164))
    })

  // right after connecting the cube can take ~9 s to answer (seen on a V10 AI), so keep asking before doubting the address
  const answered = async () => {
    for (let i = 0; i < MY32_HANDSHAKE_TRIES; i++) if (await handshake()) return true
    return false
  }
  while (!(await answered())) {
    diag('moyu32.handshake.failed', { name }, 'warn')
    const next = await askMac({ deviceName: name, suggested: mac, failed: mac, advertisementsOff })
    if (!next) {
      disconnect()
      throw new Error('The cube did not answer, so its moves cannot be read. Check its Bluetooth address and connect again.')
    }
    mac = next
    codec = makeCodec(mac)
  }

  diag('moyu32.handshake.ok', { name })
  rememberMac(name, mac)
  // 0xAC with byte 2 set switches the orientation stream on, cleared switches it off
  await request(172, [0, h.gyro ? 1 : 0])
  return { name, device, markSolved: () => undefined, disconnect }
}

/** Old MoYu WeiLong AI: each face reports rotation in ninths of a turn; a move is a crossing of the halfway mark. */
export async function connectMoyuClassic(h: SmartCubeHandlers, chosen?: BluetoothDevice): Promise<SmartCubeConnection> {
  const device = chosen ?? await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'MHC' }], optionalServices: [MHC_UUID('1000')] })
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
    device,
    markSolved: () => {
      faceStatus.fill(0)
    },
    disconnect: () => {
      turn.removeEventListener('characteristicvaluechanged', onTurn)
      gatt.disconnect()
    },
  }
}
