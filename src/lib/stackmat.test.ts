import { describe, expect, it } from 'vitest'
import { encodePacket, parsePacket, StackmatDecoder } from './stackmat'

const RATE = 44100

/** First-order high-pass, like a sound card's coupling capacitor, plus a little noise. */
function acCouple(x: number[], noise = 0.02): number[] {
  const a = 0.995
  let prevIn = 0
  let prevOut = 0
  let seed = 1
  return x.map((v) => {
    const out = a * (prevOut + v - prevIn)
    prevIn = v
    prevOut = out
    seed = (seed * 16807) % 2147483647
    return out + ((seed / 2147483647) - 0.5) * noise
  })
}

describe('stackmat', () => {
  it('parses a packet with a valid checksum', () => {
    const bytes = [' ', '0', '1', '2', '3', '4'].map((c) => c.charCodeAt(0))
    expect(parsePacket([...bytes, 64 + 10])).toEqual({ status: 'running', time: 12340 })
    expect(parsePacket([...bytes, 64 + 11])).toBeNull()
  })

  it('decodes a clean waveform', () => {
    const d = new StackmatDecoder(RATE)
    const out = d.push(encodePacket('S', 12340, RATE))
    expect(out).toEqual([{ status: 'stopped', time: 12340 }])
  })

  it('decodes an inverted, AC-coupled, noisy stream split into chunks', () => {
    const d = new StackmatDecoder(RATE)
    const wave = acCouple([
      ...encodePacket(' ', 5010, RATE, { invert: true }),
      ...encodePacket(' ', 5100, RATE, { invert: true }),
      ...encodePacket('S', 72990, RATE, { invert: true }),
    ])
    const got = []
    for (let i = 0; i < wave.length; i += 512) got.push(...d.push(wave.slice(i, i + 512)))
    expect(got.map((p) => p.time)).toEqual([5010, 5100, 72990])
    expect(got[2].status).toBe('stopped')
  })
})
