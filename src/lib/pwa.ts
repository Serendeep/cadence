import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { whenNotSolving } from './solving'
import { toast } from './toast'

const UPDATE_TOAST_MS = 60 * 60 * 1000
const HINT_TOAST_MS = 20_000
// browsers only look for a new service worker on navigation, so an open tab asks on its own
const UPDATE_CHECK_MS = 30 * 60 * 1000
const IOS_HINT_KEY = 'iosInstallHintShown'
const INSTALL_OFFER_KEY = 'installOfferShown'

interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let installPrompt: InstallPrompt | null = null
const installListeners = new Set<() => void>()
const setInstallPrompt = (e: InstallPrompt | null) => {
  installPrompt = e
  installListeners.forEach((l) => l())
}

/** True while the browser can install the app (Chrome, Edge, Android); Settings shows an Install button then. */
export const useCanInstall = () =>
  useSyncExternalStore((l) => (installListeners.add(l), () => installListeners.delete(l)), () => installPrompt !== null)

export async function installApp(): Promise<void> {
  const e = installPrompt
  if (!e) return
  await e.prompt()
  // a prompt can be shown only once; Chrome fires a fresh event later if the user said no
  setInstallPrompt(null)
}

function offerInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    setInstallPrompt(e as InstallPrompt)
    if (!onceFlag(INSTALL_OFFER_KEY)) return
    toast('Install Cadence for offline use', { label: 'Install', run: () => void installApp() }, HINT_TOAST_MS)
  })
  window.addEventListener('appinstalled', () => setInstallPrompt(null))
}

/** True the first time it is asked for this key on this device. */
function onceFlag(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
    return true
  } catch {
    return false
  }
}

/** Browser only: offline cache with an update prompt, durable storage, and the iOS install hint. */
export function startWebApp(): void {
  const update = registerSW({
    // never interrupt a solve: the notice waits until the current one is over
    onNeedRefresh: () => whenNotSolving(() => toast('A new version is ready', { label: 'Reload', run: () => void update(true) }, UPDATE_TOAST_MS)),
    onRegisterError: (e: unknown) => console.warn('Offline support could not start', e),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      const check = () => {
        // offline, or the server is unreachable: the next check tries again
        if (navigator.onLine) registration.update().catch(() => undefined)
      }
      window.setInterval(check, UPDATE_CHECK_MS)
      window.addEventListener('online', check)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
  // without this the browser may clear the solve database when the disk runs low
  navigator.storage?.persist?.().catch((e: unknown) => console.warn('Persistent storage was refused', e))
  offerInstall()
  iosInstallHint()
}

function iosInstallHint(): void {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone
  if (!ios || installed || !onceFlag(IOS_HINT_KEY)) return
  // Safari deletes a site's data after 7 days without a visit unless it is on the Home Screen
  toast('Keep your times safe: tap Share, then Add to Home Screen.', undefined, HINT_TOAST_MS)
}
