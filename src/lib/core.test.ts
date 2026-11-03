import { describe, expect, it } from 'vitest'
import { averageOf, histogram, meanOf, rollingAverage, sessionStats } from './stats'
import { DNF, effective, formatMs, parseTime } from './time'
import { applyAlg, invertAlg, isSolved, solvedCube, stateKey, faceGrid } from './cube'
import { detectCfop } from './cfop'
import { initialTimer, timerReducer, type TimerConfig, type TimerEvent, type TimerState } from './timerMachine'

describe('time formatting', () => {
  it('truncates instead of rounding', () => {
    expect(formatMs(12349)).toBe('12.34')
    expect(formatMs(72345)).toBe('1:12.34')
    expect(formatMs(5009, 3)).toBe('5.009')
    expect(formatMs(DNF)).toBe('DNF')
  })
  it('parses typed times', () => {
    expect(parseTime('12.34')).toBe(12340)
    expect(parseTime('1:02.5')).toBe(62500)
    expect(parseTime('dnf')).toBe(DNF)
    expect(parseTime('abc')).toBeNull()
  })
  it('applies penalties', () => {
    expect(effective(10000, '+2')).toBe(12000)
    expect(effective(10000, 'dnf')).toBe(DNF)
  })
})

describe('WCA averages', () => {
  const t = [14210, 12840, 13570, 11920, 15380, 12400, 13110, 12970, 14060, 10920, 13450, 12840]
  it('ao5 drops best and worst', () => {
    expect(averageOf(t, 5)).toBeCloseTo((12970 + 13450 + 12840) / 3)
  })
  it('ao12 drops one each side', () => {
    const sum = t.reduce((a, b) => a + b) - 10920 - 15380
    expect(averageOf(t, 12)).toBeCloseTo(sum / 10)
  })
  it('one DNF is trimmed, two make the average DNF', () => {
    expect(averageOf([10000, 11000, DNF, 12000, 13000], 5)).toBeCloseTo(12000)
    expect(averageOf([10000, DNF, DNF, 12000, 13000], 5)).toBe(DNF)
  })
  it('ao100 trims five each side', () => {
    const v = Array.from({ length: 100 }, (_, i) => (i + 1) * 100)
    expect(averageOf(v, 100)).toBeCloseTo(((6 + 95) / 2) * 100)
  })
  it('mo3 is a plain mean', () => {
    expect(meanOf([1000, 2000, 3000], 3)).toBe(2000)
    expect(meanOf([1000, DNF, 3000], 3)).toBe(DNF)
  })
  it('rolling and best averages agree', () => {
    const r = rollingAverage(t, 5)
    expect(r.slice(0, 4).every((v) => v === null)).toBe(true)
    const s = sessionStats(t)
    expect(s.bestAvg[5]).toBe(Math.min(...(r.filter((v) => v != null) as number[])))
    expect(s.best).toBe(10920)
    expect(s.count).toBe(12)
  })
  it('histogram counts every finished solve', () => {
    expect(histogram(t).reduce((a, b) => a + b.count, 0)).toBe(12)
  })
})

describe('cube model', () => {
  const scr = "R2 D' F2 U' L2 D R2 U2 F2 D' B' L' U B2 R' F D2 R' U' F'"
  it('scramble then inverse is solved', () => {
    expect(isSolved(applyAlg(applyAlg(solvedCube(), scr), invertAlg(scr)))).toBe(true)
  })
  it('sexy move has order 6', () => {
    expect(isSolved(applyAlg(solvedCube(), Array(6).fill("R U R' U'").join(' ')))).toBe(true)
    expect(isSolved(applyAlg(solvedCube(), Array(5).fill("R U R' U'").join(' ')))).toBe(false)
  })
  it('R moves front stickers to the top', () => {
    const s = applyAlg(solvedCube(), 'R')
    expect(faceGrid(s, 'U').join('')).toBe('UUFUUFUUF')
    expect(stateKey(s)).not.toBe(stateKey(solvedCube()))
  })
})

describe('CFOP detection', () => {
  it('finds phase boundaries in a hand-built solve', () => {
    const pll = "R U R' U' R' F R2 U' R' U' R U R' F'"
    const oll = "R U R' U R U2 R'"
    const f2l = "R U R'"
    const start = applyAlg(solvedCube(), invertAlg(`F2 ${f2l} ${oll} ${pll}`))
    const moves = `F2 ${f2l} ${oll} ${pll}`.split(' ').map((m, i) => ({ m, t: (i + 1) * 100 }))
    const r = detectCfop(start, moves)!
    expect(r).not.toBeNull()
    expect(r.moveEnds[3]).toBe(moves.length)
    expect(r.moveEnds[0]).toBeLessThanOrEqual(r.moveEnds[1])
    expect(r.moveEnds[1]).toBeLessThanOrEqual(r.moveEnds[2])
    expect(r.splits[3]).toBe(moves[moves.length - 1].t)
  })
  it('returns null when the cube is not solved', () => {
    expect(detectCfop(solvedCube(), [{ m: 'R', t: 100 }])).toBeNull()
  })
})

describe('timer machine', () => {
  const run = (cfg: TimerConfig, evs: TimerEvent[]) =>
    evs.reduce<TimerState>((s, e) => timerReducer(s, e, cfg), initialTimer)
  const cfg: TimerConfig = { inspection: false, holdMs: 300, phases: 1 }

  it('releasing before the hold time does not start', () => {
    expect(run(cfg, [{ type: 'press', at: 0 }, { type: 'tick', at: 100 }, { type: 'release', at: 150 }]).phase).toBe('idle')
  })
  it('hold, release, press records the time', () => {
    const s = run(cfg, [
      { type: 'press', at: 0 }, { type: 'tick', at: 300 }, { type: 'release', at: 400 }, { type: 'press', at: 12400 },
    ])
    expect(s).toEqual({ phase: 'stopped', result: { time: 12000, penalty: 'ok', splits: [12000] } })
  })
  it('multi-phase presses record splits', () => {
    const s = run({ ...cfg, holdMs: 0, phases: 3 }, [
      { type: 'press', at: 0 }, { type: 'release', at: 0 },
      { type: 'press', at: 2000 }, { type: 'press', at: 7000 }, { type: 'press', at: 10000 },
    ])
    expect(s.phase === 'stopped' && s.result.splits).toEqual([2000, 7000, 10000])
  })
  it('starting 16s into inspection is +2, 18s is DNF', () => {
    const c = { ...cfg, inspection: true, holdMs: 0 }
    const start = (at: number) => run(c, [
      { type: 'press', at: 0 }, { type: 'release', at: 0 }, { type: 'press', at }, { type: 'release', at },
    ])
    expect((start(10000) as { penalty: string }).penalty).toBe('ok')
    expect((start(16000) as { penalty: string }).penalty).toBe('+2')
    expect((start(18000) as { penalty: string }).penalty).toBe('dnf')
  })
  it('stopped waits for key release before going idle', () => {
    const s = run({ ...cfg, holdMs: 0 }, [
      { type: 'press', at: 0 }, { type: 'release', at: 0 }, { type: 'press', at: 5000 }, { type: 'press', at: 5001 },
    ])
    expect(s.phase).toBe('stopped')
    expect(timerReducer(s, { type: 'release', at: 5100 }, cfg).phase).toBe('idle')
  })
})
