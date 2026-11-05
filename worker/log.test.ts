import { expect, test } from 'vitest'
import { cleanLogBatch } from './log'

test('keeps valid entries and bounds their size', () => {
  const batch = cleanLogBatch({
    session: 's1', app: '0.1.0', platform: 'pwa', ua: 'UA',
    entries: [{ t: 5, level: 'error', event: 'device.connect.failed', data: 'x'.repeat(5000) }, { level: 'nope', event: 'ok' }],
  })
  expect(batch?.entries).toHaveLength(2)
  expect(batch?.entries[0].data).toHaveLength(1000)
  expect(batch?.entries[1].level).toBe('info')
})

test('rejects payloads that are not log batches', () => {
  expect(cleanLogBatch(null)).toBeNull()
  expect(cleanLogBatch({ entries: 'x' })).toBeNull()
  expect(cleanLogBatch({ entries: [{ t: 1 }, 7] })).toBeNull()
})

test('caps the number of entries', () => {
  const entries = Array.from({ length: 500 }, (_, i) => ({ t: i, level: 'info', event: 'e' }))
  expect(cleanLogBatch({ entries })?.entries).toHaveLength(50)
})
