import { describe, expect, it } from 'vitest'
import { RECONNECT_DELAYS_MS, retryWithBackoff } from './devices'

describe('reconnect backoff', () => {
  const run = async (results: boolean[], stopAfter = Infinity) => {
    const waits: number[] = []
    const errors: number[] = []
    let calls = 0
    const value = await retryWithBackoff(
      async () => {
        if (!results[calls++]) throw new Error('no')
        return 'conn'
      },
      RECONNECT_DELAYS_MS,
      () => waits.length > stopAfter,
      (_, n) => errors.push(n),
      async (ms) => void waits.push(ms),
    )
    return { value, waits, errors, calls }
  }

  it('waits 1 s, 3 s, 6 s and gives up after the last try', async () => {
    expect(await run([false, false, false])).toEqual({ value: null, waits: [1000, 3000, 6000], errors: [1, 2, 3], calls: 3 })
  })

  it('stops at the first success', async () => {
    expect(await run([false, true])).toMatchObject({ value: 'conn', waits: [1000, 3000], calls: 2 })
  })

  it('stops trying once told to', async () => {
    expect(await run([false, false, false], 1)).toMatchObject({ value: null, calls: 1 })
  })
})
