import { expect, test } from 'vitest'
import { setSolving, whenNotSolving } from './solving'

test('a notice raised mid-solve waits for the solve to end, and shows once', () => {
  const shown: string[] = []
  whenNotSolving(() => shown.push('idle'))
  setSolving(true)
  whenNotSolving(() => shown.push('update'))
  expect(shown).toEqual(['idle'])
  setSolving(false)
  setSolving(false)
  expect(shown).toEqual(['idle', 'update'])
})
