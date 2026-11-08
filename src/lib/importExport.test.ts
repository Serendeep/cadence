import { describe, expect, it, test } from 'vitest'
import { makeBackup, parseCstimer, parseImport, solveFields, toCstimer, withoutDuplicates } from './importExport'

const sample = {
  session1: [
    [[0, 12345], "R U R' U'", '', 1700000000],
    [[2000, 9870], 'F2 B2', 'nice', 1700000100],
    [[-1, 15000], 'U', '', 1700000200],
    [['bad', 1], 'x', '', 0],
  ],
  session2: [[[0, 3200, 1100], 'R2 U', '', 1700000300]],
  properties: { sessionData: JSON.stringify({ 1: { name: 'Main', opt: {} }, 2: { name: 2, opt: { scrType: '222so' } } }) },
}

describe('cstimer import', () => {
  it('reads sessions, penalties, comments and dates', () => {
    const r = parseCstimer(sample)
    expect(r.sessions.map((s) => [s.name, s.event])).toEqual([['Main', '333'], ['cstimer 2', '222']])
    expect(r.solves.map((s) => s.penalty)).toEqual(['ok', '+2', 'dnf', 'ok'])
    expect(r.solves[1].comment).toBe('nice')
    expect(r.solves[0].date).toBe(1700000000 * 1000)
    expect(r.skipped).toBe(1)
  })
  it('keeps multi-phase splits as cumulative times', () => {
    expect(parseCstimer(sample).solves[3].splits).toEqual([1100, 3200])
  })
  it('rejects files that are not cstimer exports', () => {
    expect(() => parseImport('{"foo":1}')).toThrow(/cstimer/)
    expect(() => parseImport('not json')).toThrow(/JSON/)
  })
  it('round-trips through our backup and cstimer export', () => {
    const sessions = [{ id: 7, name: 'Main', event: '333', created: 1, order: 0 }]
    const solves = [{ id: 1, sessionId: 7, time: 12000, penalty: '+2' as const, scramble: 'R', event: '333', date: 5000 }]
    const back = parseImport(JSON.stringify(makeBackup(sessions, solves)))
    expect(back.solves[0]).toMatchObject({ sessionIndex: 0, time: 12000, penalty: '+2' })
    const cs = parseCstimer(toCstimer(sessions, solves))
    expect(cs.solves[0]).toMatchObject({ time: 12000, penalty: '+2', scramble: 'R' })
  })
})

test('importing the same solves twice adds nothing, and sessions left empty are dropped', () => {
  const solve = (sessionIndex: number, time: number) => ({ sessionIndex, time, penalty: 'ok' as const, scramble: `R U ${time}`, event: '333', date: 1000 + time })
  const data = { sessions: [{ name: 'A', event: '333', created: 0, order: 0 }, { name: 'B', event: '333', created: 0, order: 1 }], solves: [solve(0, 1), solve(1, 2), solve(1, 3)], skipped: 0 }
  const { data: out, duplicates } = withoutDuplicates(data, [{ date: 1001, time: 1, scramble: 'R U 1' }, { date: 1002, time: 2, scramble: 'R U 2' }])
  expect(duplicates).toBe(2)
  expect(out.sessions.map((s) => s.name)).toEqual(['B'])
  expect(out.solves).toEqual([{ ...solve(1, 3), sessionIndex: 0 }])
})

test('keeps the drill tag that sync and backups carry, and drops unknown ones', () => {
  const base = { time: 1000, penalty: 'ok', scramble: 'R U', event: '333', date: 1 }
  expect(solveFields({ ...base, drill: 'pll' })?.drill).toBe('pll')
  expect(solveFields({ ...base, drill: 'nope' })?.drill).toBeUndefined()
})
