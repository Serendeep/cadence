import { expect, test } from 'vitest'
import { changesSince, CHANGELOG, compareVersions } from './changelog'
import { isUpdate, onlyInBrowser } from './notices'

test('compares versions by number, not text', () => {
  expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
  expect(compareVersions('0.2.0', '0.2.0')).toBe(0)
  expect(compareVersions('0.1.2', '1.0.0')).toBeLessThan(0)
})

test('offers the notes after an update, never on a fresh install or a downgrade', () => {
  expect(isUpdate('0.1.1', '0.1.2', true)).toBe(true)
  expect(isUpdate('0.1.2', '0.1.2', true)).toBe(false)
  expect(isUpdate('0.1.3', '0.1.2', true)).toBe(false)
  expect(isUpdate(null, '0.1.2', false)).toBe(false)
  // an install from before versions were stored, with solves, is an update
  expect(isUpdate(null, '0.1.2', true)).toBe(true)
})

test('the changelog has notes for the version being built', () => {
  // a release bumps package.json; this fails it until the notes are written
  expect(compareVersions(CHANGELOG[0].version, __APP_VERSION__)).toBeGreaterThanOrEqual(0)
  expect(changesSince('0.1.1').map((r) => r.version)).toContain('0.1.2')
})

test('asks to keep solves safe only when they live in this browser alone', () => {
  expect(onlyInBrowser(200, false, false)).toBe(true)
  expect(onlyInBrowser(199, false, false)).toBe(false)
  expect(onlyInBrowser(500, true, false)).toBe(false)
  expect(onlyInBrowser(500, false, true)).toBe(false)
})
