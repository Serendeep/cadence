import { describe, expect, it } from 'vitest'
import { makeCodec, parseMy32 } from './moyu'

describe('MoYu32 protocol', () => {
  it('codec round-trips a 20-byte request', () => {
    const codec = makeCodec('CF:30:16:00:12:AB')
    const req = Array.from({ length: 20 }, (_, i) => (i * 37) & 0xff)
    const enc = codec.encode(req)
    expect(enc).not.toEqual(req)
    expect(codec.decode(new Uint8Array(enc))).toEqual(req)
  })

  it('rejects a malformed MAC', () => {
    expect(() => makeCodec('nope')).toThrow(/MAC/)
  })

  it('parses a move packet newest-first', () => {
    // type 165, five 16-bit gaps, move count 7 at bit 88, then five 5-bit moves: R (10), U' (5), F (0), B' (3), D (6)
    let b = (165).toString(2).padStart(8, '0')
    for (const g of [120, 80, 60, 40, 20]) b += g.toString(2).padStart(16, '0')
    b += (7).toString(2).padStart(8, '0')
    for (const m of [10, 5, 0, 3, 6]) b += m.toString(2).padStart(5, '0')
    b = b.padEnd(160, '0')
    const bytes = Array.from({ length: 20 }, (_, i) => parseInt(b.slice(i * 8, i * 8 + 8), 2))
    expect(parseMy32(bytes)).toEqual({ type: 'moves', moveCount: 7, moves: ['R', "U'", 'F', "B'", 'D'], gaps: [120, 80, 60, 40, 20] })
  })
})
