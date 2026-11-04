import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChartIcon, ListIcon, Mark, SettingsIcon, TimerIcon } from './components/icons'
import { answerMac, clearDeviceError, useDevices } from './lib/deviceStore'
import { useSettings, type ThemeName } from './lib/settings'
import { dismissToast, toast, useToast } from './lib/toast'
import { InsightsPage } from './pages/InsightsPage'
import { SettingsPage } from './pages/SettingsPage'
import { Dialog, SolvesPage } from './pages/SolvesPage'
import { TimerPage } from './pages/TimerPage'

type Route = 'timer' | 'solves' | 'insights' | 'settings'
const ROUTES: { id: Route; label: string; icon: ReactNode }[] = [
  { id: 'timer', label: 'Timer', icon: <TimerIcon /> },
  { id: 'solves', label: 'Solves', icon: <ListIcon /> },
  { id: 'insights', label: 'Insights', icon: <ChartIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

const readRoute = (): Route => {
  const r = location.hash.replace('#/', '').split('?')[0] as Route
  return ROUTES.some((x) => x.id === r) ? r : 'timer'
}

function useTheme(theme: ThemeName) {
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'graphite' : 'paper') : theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export default function App() {
  const settings = useSettings()
  const devices = useDevices()
  const [route, setRoute] = useState<Route>(readRoute)
  const [focused, setFocused] = useState(false)
  useTheme(settings.theme)
  useUpdateNotice()

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!devices.error) return
    toast(devices.error, undefined, 8000)
    clearDeviceError()
  }, [devices.error])

  const onFocusChange = useCallback((f: boolean) => setFocused(f), [])
  const go = (r: Route) => {
    location.hash = `/${r}`
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={`shell ${focused ? 'focused' : ''}`}>
        <nav className="rail chrome" aria-label="Main">
          <div className="mark"><Mark /></div>
          {ROUTES.map((r) => (
            <button key={r.id} type="button" className="navbtn" aria-current={route === r.id ? 'page' : undefined} aria-label={r.label} title={r.label} onClick={() => go(r.id)}>
              {route === r.id && <motion.span layoutId="nav-pip" className="pip" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              {r.icon}
              <span className="label">{r.label}</span>
              {r.id === 'timer' && (devices.cube || devices.external) && <span className="dot" aria-label="device connected" />}
            </button>
          ))}
          <div className="spacer" />
        </nav>
        <main>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="route"
            >
              {route === 'timer' && <TimerPage onFocusChange={onFocusChange} />}
              {route === 'solves' && <SolvesPage />}
              {route === 'insights' && <InsightsPage />}
              {route === 'settings' && <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ToastHost />
      <BluetoothPicker />
      <AnimatePresence>{devices.macRequest && <MacPrompt deviceName={devices.macRequest.deviceName} />}</AnimatePresence>
    </MotionConfig>
  )
}

function ToastHost() {
  const t = useToast()
  return (
    <AnimatePresence>
      {t && (
        <motion.div
          key={t.id}
          className="toast"
          role="status"
          initial={{ opacity: 0, y: 16, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 10, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <span>{t.message}</span>
          {t.action ? (
            <button type="button" onClick={() => { t.action!.run(); dismissToast() }}>{t.action.label}</button>
          ) : (
            <button type="button" onClick={dismissToast}>OK</button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface DesktopBridge {
  isDesktop: true
  onBluetoothDevices: (cb: (d: { id: string; name: string }[]) => void) => () => void
  selectBluetoothDevice: (id: string) => void
  onUpdate: (cb: (u: { kind: 'available' | 'ready'; version: string }) => void) => () => void
  installUpdate: () => void
}
const desktop = (window as unknown as { desktop?: DesktopBridge }).desktop

const UPDATE_TOAST_MS = 60 * 60 * 1000

function useUpdateNotice() {
  useEffect(
    () =>
      desktop?.onUpdate((u) =>
        toast(
          u.kind === 'ready' ? `Version ${u.version} is ready` : `Version ${u.version} is available`,
          { label: u.kind === 'ready' ? 'Restart' : 'Download', run: () => desktop.installUpdate() },
          UPDATE_TOAST_MS,
        ),
      ),
    [],
  )
}

/** The desktop app has no browser device chooser, so the app shows its own. */
function BluetoothPicker() {
  const [devices, setDevices] = useState<{ id: string; name: string }[] | null>(null)
  useEffect(() => desktop?.onBluetoothDevices((d) => setDevices(d)), [])
  if (!desktop) return null
  const pick = (id: string) => {
    desktop.selectBluetoothDevice(id)
    setDevices(null)
  }
  return (
    <AnimatePresence>
      {devices && (
        <Dialog title="Choose your device" onClose={() => pick('')}>
          <p className="dim">Turn the cube or timer on and keep it close. It appears here when found.</p>
          <div className="devlist">
            {devices.length === 0 && <div className="empty">Searching…</div>}
            {devices.map((d) => (
              <button key={d.id} type="button" onClick={() => pick(d.id)}>{d.name}</button>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => pick('')}>Cancel</button>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
}

function MacPrompt({ deviceName }: { deviceName: string }) {
  const [mac, setMac] = useState('')
  const valid = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac.trim())
  return (
    <Dialog title="Cube address needed" onClose={() => answerMac(null)}>
      <p className="dim">
        {deviceName} encrypts its moves with its Bluetooth address, and this system did not report it. Find it in your OS Bluetooth settings
        (for example with <span className="mono">bluetoothctl devices</span>) and enter it here.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) answerMac(mac.trim())
        }}
      >
        <label htmlFor="mac" className="dim" style={{ fontSize: 13 }}>Bluetooth address</label>
        <input id="mac" type="text" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="CF:30:16:00:12:AB" autoFocus style={{ width: '100%', marginTop: 6 }} aria-describedby="mac-help" />
        <p id="mac-help" className="dim" style={{ fontSize: 12 }}>Six pairs of hex digits separated by colons.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => answerMac(null)}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!valid}>Connect</button>
        </div>
      </form>
    </Dialog>
  )
}
