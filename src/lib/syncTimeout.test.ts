import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
})

test('a stalled sync times out, releases the retry button and can be retried', async () => {
  vi.useFakeTimers()
  const storage = new Map([['cadence:sync', JSON.stringify({ token: 'test-token', pushedAt: -1 })]])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('window', globalThis)
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
    return controller.signal
  })
  const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal!.reason))
  }))
  vi.stubGlobal('fetch', fetch)
  const { syncNow } = await import('./sync')
  const first = syncNow()
  await vi.advanceTimersByTimeAsync(31_000)
  expect(JSON.parse(storage.get('cadence:sync')!).status).toBe('error')
  await first
  fetch.mockImplementation(async () => new Response(JSON.stringify({ version: 1, more: false, changes: [] })))
  const retry = syncNow()
  await vi.advanceTimersByTimeAsync(100)
  await retry
  expect(JSON.parse(storage.get('cadence:sync')!).status).toBe('idle')
})
