/**
 * Stackmat (Gen 2-5 / SpeedStacks) audio-jack protocol decoder.
 * The timer sends ~1200 baud 8N1 serial frames: status, 5 or 6 ASCII digits, checksum (64 + digit sum), "\n\r".
 * Decoding is edge-based so the droop of an AC-coupled sound card input during idle stretches is harmless.
 */
export type StackmatStatus = 'idle' | 'ready' | 'running' | 'stopped' | 'left' | 'right' | 'both'

export interface StackmatPacket {
  status: StackmatStatus
  /** Time on the display in milliseconds */
  time: number
}

const BAUD = 1200
/** Bits in one 8N1 frame plus one: a constant run longer than this is the idle line. */
const IDLE_BITS = 11
const STATUS: Record<string, StackmatStatus> = {
  I: 'idle', A: 'ready', ' ': 'running', S: 'stopped', L: 'left', R: 'right', C: 'both',
}

export function parsePacket(bytes: readonly number[]): StackmatPacket | null {
  if (bytes.length !== 7 && bytes.length !== 8) return null
  const status = STATUS[String.fromCharCode(bytes[0])]
  const digits = bytes.slice(1, -1).map((b) => b - 48)
  if (!status || digits.some((d) => d < 0 || d > 9)) return null
  if (bytes[bytes.length - 1] !== 64 + digits.reduce((a, b) => a + b, 0)) return null
  const [m, s1, s2, ...frac] = digits
  const fracMs = frac.length === 3 ? frac[0] * 100 + frac[1] * 10 + frac[2] : (frac[0] * 10 + frac[1]) * 10
  return { status, time: m * 60000 + (s1 * 10 + s2) * 1000 + fracMs }
}

/** Serial framer: bits in, bytes out, with resync after framing errors. */
class Framer {
  private bits: number[] = []
  private bytes: number[] = []
  readonly packets: StackmatPacket[] = []
  private readonly invert: boolean

  constructor(invert: boolean) {
    this.invert = invert
  }

  pushBit(raw: number): void {
    const bit = this.invert ? 1 - raw : raw
    if (this.bits.length === 0 && bit === 1) return // idle line, wait for a start bit
    this.bits.push(bit)
    if (this.bits.length < 10) return
    const frame = this.bits
    this.bits = []
    if (frame[9] !== 1) {
      this.bytes = [] // framing error: drop the partial packet
      return
    }
    let byte = 0
    for (let i = 0; i < 8; i++) byte |= frame[1 + i] << i
    this.pushByte(byte)
  }

  private pushByte(byte: number): void {
    this.bytes.push(byte)
    const n = this.bytes.length
    if (n >= 2 && this.bytes[n - 2] === 10 && byte === 13) {
      const p = parsePacket(this.bytes.slice(0, -2))
      if (p) this.packets.push(p)
      this.bytes = []
    } else if (n > 12) {
      this.bytes = this.bytes.slice(-12)
    }
  }

  idle(): void {
    this.bits = []
  }
}

export class StackmatDecoder {
  private readonly spb: number
  private level = 1
  private run = 0
  private prev2 = 0
  private prev1 = 0
  private peak = 0
  private flushed = false
  private readonly framers = [new Framer(false), new Framer(true)]
  private locked: Framer | null = null

  constructor(sampleRate: number) {
    this.spb = sampleRate / BAUD
  }

  /** Feed raw audio samples; returns any complete, checksum-valid packets. */
  push(samples: Float32Array | readonly number[]): StackmatPacket[] {
    for (const s of samples) {
      const d = s - this.prev2
      this.prev2 = this.prev1
      this.prev1 = s
      this.peak = Math.max(Math.abs(d), this.peak * 0.9995)
      const thr = this.peak * 0.35
      let next = this.level
      if (d > thr) next = 1
      else if (d < -thr) next = 0
      if (next !== this.level) {
        // runs under half a bit are glitches (or the unknown starting level): follow the edge, emit nothing
        if (!this.flushed && this.run >= this.spb * 0.5) this.emit(this.level, Math.round(this.run / this.spb))
        this.level = next
        this.run = 0
        this.flushed = false
      }
      this.run++
      // a run longer than a frame is line idle: flush it now so the last byte of a packet is not held back
      if (!this.flushed && this.run > this.spb * IDLE_BITS) {
        this.emit(this.level, IDLE_BITS + 1)
        this.flushed = true
      }
    }
    const out: StackmatPacket[] = []
    for (const f of this.locked ? [this.locked] : this.framers) {
      if (f.packets.length && !this.locked) this.locked = f
      out.push(...f.packets.splice(0))
    }
    return out
  }

  private emit(level: number, n: number): void {
    const capped = Math.min(n, IDLE_BITS)
    for (const f of this.framers) {
      for (let i = 0; i < capped; i++) f.pushBit(level)
      if (n > IDLE_BITS) f.idle()
    }
  }
}

/** Test/demo helper: renders a packet as an audio waveform. */
export function encodePacket(statusChar: string, ms: number, sampleRate: number, opts: { invert?: boolean; gapBits?: number } = {}): number[] {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const c = Math.floor((ms % 1000) / 10)
  const digits = [m, Math.floor(s / 10), s % 10, Math.floor(c / 10), c % 10]
  const bytes = [statusChar.charCodeAt(0), ...digits.map((d) => d + 48), 64 + digits.reduce((a, b) => a + b, 0), 10, 13]
  const bits: number[] = Array(opts.gapBits ?? 20).fill(1)
  for (const b of bytes) {
    bits.push(0)
    for (let i = 0; i < 8; i++) bits.push((b >> i) & 1)
    bits.push(1)
  }
  bits.push(...Array(opts.gapBits ?? 20).fill(1))
  const spb = sampleRate / BAUD
  const out: number[] = []
  for (let i = 0; i < bits.length; i++) {
    const v = (opts.invert ? 1 - bits[i] : bits[i]) ? 0.5 : -0.5
    const end = Math.round((i + 1) * spb)
    while (out.length < end) out.push(v)
  }
  return out
}
