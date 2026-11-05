import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

const { updateMode } = createRequire(import.meta.url)('./updateMode.cjs') as { updateMode: (p: string, a?: string) => string }

test('only Windows and AppImage builds install updates themselves', () => {
  expect(updateMode('win32')).toBe('install')
  expect(updateMode('linux', '/home/u/Cadence.AppImage')).toBe('install')
  expect(updateMode('linux')).toBe('notify')
  expect(updateMode('darwin')).toBe('notify')
})
