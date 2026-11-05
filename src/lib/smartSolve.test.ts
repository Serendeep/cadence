import { describe, expect, it } from 'vitest'
import { invertAlg } from './cube'
import { newTracker, scrambleHint, simplify, trackMove, type SmartFinish, type Tracker } from './smartSolve'

const feed = (t: Tracker, alg: string, start = 0, step = 100) => {
  let cur = t
  let finished: SmartFinish | undefined
  alg.split(' ').forEach((m, i) => {
    const r = trackMove(cur, m, start + i * step)
    cur = r.tracker
    finished = r.finished ?? finished
  })
  return { t: cur, finished }
}

describe('smart cube tracker', () => {
  const scr = "R U F2 L' D"

  it('follows the scramble and arms when it is applied', () => {
    const { t } = feed(newTracker(scr), "R U F2 L'")
    expect(t.progress).toBe(4)
    expect(t.phase).toBe('scrambling')
    expect(feed(t, 'D').t.phase).toBe('armed')
  })

  it('counts half of a double turn as progress', () => {
    const { t } = feed(newTracker(scr), 'R U F')
    expect(scrambleHint(t)).toMatchObject({ undo: '', remaining: ['F', "L'", 'D'] })
  })

  it('suggests an undo after a wrong turn', () => {
    const { t } = feed(newTracker(scr), "R B'")
    expect(scrambleHint(t).undo).toBe('B')
    expect(feed(t, 'B').t.progress).toBe(1)
  })

  it('accumulates several wrong turns into one undo', () => {
    const { t } = feed(newTracker(scr), "R B' D2")
    expect(scrambleHint(t).undo).toBe("D2 B")
    expect(feed(t, 'D2 B').t.progress).toBe(1)
  })

  it('times the solve from the first move and finishes when solved', () => {
    const armed = feed(newTracker(scr), scr).t
    const { finished } = feed(armed, invertAlg(scr), 1000, 250)
    expect(finished).toBeDefined()
    expect(finished!.time).toBe(4 * 250)
    expect(finished!.moves).toHaveLength(5)
  })

  it('simplifies move sequences', () => {
    expect(simplify(['R', 'R', 'U', "U'", 'F', 'F', 'F'])).toEqual(['R2', "F'"])
  })
})
