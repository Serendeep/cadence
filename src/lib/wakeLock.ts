/**
 * Keeps the screen on while Cadence is visible (Screen Wake Lock API). The browser drops the lock whenever the
 * tab is hidden, so it is requested again on every return; browsers without the API simply sleep as usual.
 */
let lock: WakeLockSentinel | null = null

async function acquire(): Promise<void> {
  if (lock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
  try {
    lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => (lock = null))
  } catch (e) {
    // refused, e.g. battery saver on; the screen just sleeps as normal
    console.warn('Could not keep the screen awake', e)
  }
}

function release(): void {
  void lock?.release()
  lock = null
}

/** Applies the setting now and keeps applying it as the tab is hidden and shown again. */
export function keepScreenAwake(enabled: () => boolean): () => void {
  const sync = () => (enabled() ? void acquire() : release())
  sync()
  document.addEventListener('visibilitychange', sync)
  return sync
}
