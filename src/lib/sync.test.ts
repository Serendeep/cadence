import { expect, test } from 'vitest'
import { batchSize, type SyncRecord } from './sync'

const rec = (bytes: number): SyncRecord => ({ kind: 'solve', uid: 'u', updated: 1, deleted: false, data: { pad: 'x'.repeat(bytes) } })

test('a batch holds at most 500 records and stays under 4 MB, but always moves at least one', () => {
  expect(batchSize(Array(1200).fill(rec(10)))).toBe(500)
  expect(batchSize(Array(100).fill(rec(100_000)))).toBe(41)
  expect(batchSize([rec(5_000_000), rec(10)])).toBe(1)
  expect(batchSize([])).toBe(0)
})
