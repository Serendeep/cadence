import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

const { toPrune, isBackup } = createRequire(import.meta.url)('./backups.cjs') as {
  toPrune: (names: string[], keep?: number) => string[]
  isBackup: (json: unknown) => boolean
}

test('keeps the newest seven backups and ignores other files', () => {
  const days = Array.from({ length: 9 }, (_, i) => `cadence-backup-2026-11-0${i + 1}.json`)
  expect(toPrune([...days, 'notes.txt', 'cadence-backup-2026-11-09.json.tmp'])).toEqual([days[1], days[0]])
  expect(toPrune(days.slice(0, 3))).toEqual([])
})

test('accepts only a Cadence backup', () => {
  expect(isBackup(JSON.stringify({ app: 'better-cstimer', version: 1, sessions: [], solves: [] }))).toBe(true)
  expect(isBackup(JSON.stringify({ app: 'other', sessions: [], solves: [] }))).toBe(false)
  expect(isBackup('{not json')).toBe(false)
  expect(isBackup({ app: 'better-cstimer' })).toBe(false)
})
