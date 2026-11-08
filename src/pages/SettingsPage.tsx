import { AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Segmented, Switch } from '../components/Bits'
import { clearAll, db, importData, matchSession } from '../lib/db'
import { connectCube, connectExternal, disconnectCube, disconnectExternal, useDevices, type CubeKind } from '../lib/deviceStore'
import { bluetoothAvailable } from '../lib/devices'
import { eventById } from '../lib/events'
import { makeBackup, parseImport, toCstimer, withoutDuplicates, type ImportedData } from '../lib/importExport'
import { setSettings, useSettings, type ThemeName } from '../lib/settings'
import { toast } from '../lib/toast'
import { installApp, useCanInstall } from '../lib/pwa'
import { deleteAccountData, resolveAccountSwitch, signIn, signOut, syncNow, useSync } from '../lib/sync'
import { playCall, VOICES } from '../lib/voice'
import { REPO_URL, shareCadence } from '../lib/notices'
import { WhatsNew } from '../components/WhatsNew'
import { Dialog } from './SolvesPage'

const THEME_SWATCH: Record<Exclude<ThemeName, 'system'>, [string, string, string]> = {
  graphite: ['#141416', '#ecebe8', '#e2b714'],
  nord: ['#242933', '#e5e9f0', '#88c0d0'],
  matcha: ['#1d2420', '#e6ede8', '#7fd19b'],
  paper: ['#f2f1ee', '#1b1b1b', '#c62f36'],
  'mono-light': ['#ffffff', '#111111', '#2a62c9'],
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

interface ImportPreview {
  file: string
  data: ImportedData
  duplicates: number
  /** Per imported session: true when it tops up a session already here */
  merges: boolean[]
}

const dateRange = (dates: number[]) => {
  if (!dates.length) return ''
  const fmt = (d: number) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const [from, to] = [fmt(Math.min(...dates)), fmt(Math.max(...dates))]
  return from === to ? `from ${from}` : `${from} to ${to}`
}

/** What a file holds, before anything is written. */
function ImportDialog({ preview, onCancel, onConfirm }: { preview: ImportPreview; onCancel: () => void; onConfirm: () => void }) {
  const { data, duplicates } = preview
  const counts = data.sessions.map((_, i) => data.solves.filter((s) => s.sessionIndex === i).length)
  const nothing = data.solves.length === 0
  return (
    <Dialog title={nothing ? 'Nothing new to import' : `Import ${data.solves.length.toLocaleString()} solves?`} onClose={onCancel}>
      <p className="dim">
        {nothing
          ? `Every solve in ${preview.file} is already here.`
          : `${preview.file}, solves ${dateRange(data.solves.map((s) => s.date))}.`}
        {duplicates > 0 && !nothing && ` ${duplicates.toLocaleString()} solves you already have are skipped.`}
        {data.skipped > 0 && ` ${data.skipped.toLocaleString()} unreadable rows are skipped.`}
      </p>
      {!nothing && (
        <ul className="import-list">
          {data.sessions.map((s, i) => (
            <li key={i}>
              <span>
                {s.name}
                {eventById(s.event).short !== s.name && <span className="dim"> · {eventById(s.event).short}</span>}
              </span>
              <span className="dim">{preview.merges[i] ? 'adds to yours' : 'new session'}</span>
              <b className="num">{counts[i].toLocaleString()}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>{nothing ? 'Close' : 'Cancel'}</button>
        {!nothing && <button type="button" className="btn primary" onClick={onConfirm} autoFocus>Import</button>}
      </div>
    </Dialog>
  )
}

function syncStatus(status: string, lastSynced: number | null): string {
  if (status === 'syncing') return 'Syncing…'
  if (status === 'error') return 'Could not reach the sync server. Your solves are safe here and sync when it is back.'
  return lastSynced ? `Last synced ${new Date(lastSynced).toLocaleString()}` : 'Not synced yet'
}

/** Sign-in and sync; data stays on this device either way. */
function AccountRow() {
  const sync = useSync()
  const [confirmWipe, setConfirmWipe] = useState(false)
  const switchDialog = (
    <AnimatePresence>
      {sync.switching && (
        <Dialog title={`Add this device's solves to ${sync.switching.to}?`} onClose={() => resolveAccountSwitch(false)}>
          <p className="dim">
            This device last synced with {sync.switching.from}'s account. Signing in as {sync.switching.to} uploads every session and solve on this device into {sync.switching.to}'s account.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={() => resolveAccountSwitch(false)}>Don't sign in</button>
            <button type="button" className="btn primary" onClick={() => resolveAccountSwitch(true)}>Add them</button>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  )
  if (!sync.token) {
    return (
      <Row id="account" title="Sync across devices" desc="Sign in with your World Cube Association account to keep your sessions, solves and settings the same on your phone, tablet and computer. Optional: without it, everything stays on this device.">
        <button type="button" className="btn primary" onClick={() => void signIn()}>Sign in with WCA</button>
        {switchDialog}
      </Row>
    )
  }
  const who = sync.account ? `${sync.account.name}${sync.account.wcaId ? ` · ${sync.account.wcaId}` : ''}` : 'Signed in'
  return (
    <Row id="account" title={who} desc={syncStatus(sync.status, sync.lastSynced)}>
      <button type="button" className="btn" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
      <button type="button" className="btn" onClick={() => void signOut().then(() => toast('Signed out. Your solves stay on this device.'))}>Sign out</button>
      <button type="button" className="btn danger" onClick={() => setConfirmWipe(true)}>Delete synced data</button>
      <AnimatePresence>
        {confirmWipe && (
          <Dialog title="Delete your synced data?" onClose={() => setConfirmWipe(false)}>
            <p className="dim">This erases the copy of your sessions, solves and settings kept for syncing and signs out every device. Each device keeps the solves it already has.</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setConfirmWipe(false)}>Keep it</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirmWipe(false)
                  deleteAccountData().then(
                    () => toast('Synced data deleted. This device keeps its solves.'),
                    () => toast('Could not delete the synced data. Check your connection and try again.'),
                  )
                }}
              >
                Delete synced data
              </button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </Row>
  )
}

/** Scrolls its row into view once, for links that land on a specific setting. */
function ScrollHere({ when }: { when: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (when) ref.current?.closest('.setting')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [when])
  return <span ref={ref} hidden />
}

function Row({ title, desc, children, id }: { title: string; desc?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="setting" id={id}>
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      <div className="ctl">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const s = useSettings()
  const devices = useDevices()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const bt = bluetoothAvailable()
  const canInstall = useCanInstall()

  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [dragging, setDragging] = useState(false)

  const onImport = async (f: File) => {
    setBusy(true)
    try {
      const parsed = parseImport(await f.text())
      const [solves, sessions] = await Promise.all([db.solves.toArray(), db.sessions.toArray()])
      const fresh = withoutDuplicates(parsed, solves)
      setPreview({ file: f.name, ...fresh, merges: fresh.data.sessions.map((s) => matchSession(sessions, s) != null) })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const confirmImport = async (p: ImportPreview) => {
    setPreview(null)
    const ids = await importData(p.data)
    // open the biggest imported session, so the solves are on screen straight away
    const counts = p.data.sessions.map((_, i) => p.data.solves.filter((s) => s.sessionIndex === i).length)
    const biggest = ids[counts.indexOf(Math.max(...counts))]
    if (biggest != null) setSettings({ sessionId: biggest })
    toast(`Imported ${p.data.solves.length.toLocaleString()} solves`, { label: 'View solves', run: () => location.assign('#/solves') })
  }

  const exportAll = async (format: 'backup' | 'cstimer') => {
    const [sessions, solves] = await Promise.all([db.sessions.orderBy('order').toArray(), db.solves.orderBy('date').toArray()])
    if (format === 'backup') download(`cadence-backup-${stamp()}.json`, makeBackup(sessions, solves))
    else download(`cstimer-export-${stamp()}.txt`, toCstimer(sessions, solves))
  }

  const cube = (kind: CubeKind) => {
    disconnectExternal()
    setSettings({ input: 'smartcube' })
    void connectCube(kind)
  }

  return (
    <div
      className={`page ${dragging ? 'dropping' : ''}`}
      style={{ maxWidth: 1100 }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) void onImport(f)
      }}
    >
      <div className="pagehead">
        <div>
          <h1>Settings</h1>
          <p>Saved on this device as you change them, and synced when you sign in.</p>
        </div>
      </div>

      <h2 className="setting-group">Account</h2>
      <AccountRow />

      {canInstall && (
        <Row title="Install the app" desc="Adds Cadence to your home screen or app list. It opens in its own window and works offline.">
          <button type="button" className="btn primary" onClick={() => void installApp()}>Install</button>
        </Row>
      )}

      <h2 className="setting-group">Appearance</h2>
      <Row title="Theme" desc="System follows your OS: paper in light mode, graphite in dark.">
        <button type="button" className="swatch" aria-pressed={s.theme === 'system'} onClick={() => setSettings({ theme: 'system' })}>
          <span style={{ background: 'linear-gradient(90deg, #f2f1ee 50%, #141416 50%)', padding: '8px 10px', fontSize: 18, fontWeight: 500 }}>
            <em className="split-sample">12.84</em>
          </span>
          system
        </button>
        {(Object.keys(THEME_SWATCH) as (keyof typeof THEME_SWATCH)[]).map((t) => {
          const [bg, fg, acc] = THEME_SWATCH[t]
          return (
            <button key={t} type="button" className="swatch" aria-pressed={s.theme === t} onClick={() => setSettings({ theme: t })}>
              <span style={{ background: bg, color: fg, padding: '8px 10px', fontSize: 18, fontWeight: 500 }}>
                12.84
                <i style={{ background: acc }} />
              </span>
              {t.replace('-', ' ')}
            </button>
          )
        })}
      </Row>

      <h2 className="setting-group">Timing</h2>
      <Row title="Inspection" desc="WCA 15 seconds. Starting after 15 s adds +2, after 17 s is a DNF. Blindfolded events skip it.">
        <Switch label="Inspection" checked={s.inspection} onChange={(v) => setSettings({ inspection: v })} />
        <span className="dim" style={{ fontSize: 14, marginLeft: 12 }}>Call out 8 s and 12 s</span>
        <Segmented
          id="voice"
          label="Inspection voice"
          value={s.inspectionVoice}
          onChange={(v) => {
            setSettings({ inspectionVoice: v })
            playCall(v, 8000)
          }}
          options={VOICES.map((v) => ({ value: v, label: v }))}
        />
      </Row>

      <Row title="Keep the screen on" desc="Stops the screen from dimming or locking while Cadence is open, so it is ready between solves.">
        <Switch label="Keep the screen on" checked={s.keepAwake} onChange={(v) => setSettings({ keepAwake: v })} />
      </Row>

      <Row title="Hold to start" desc="How long space or a touch must be held before the time turns green.">
        <Segmented
          id="hold"
          label="Hold time"
          value={s.holdMs}
          onChange={(v) => setSettings({ holdMs: v })}
          options={[0, 300, 550, 1000].map((v) => ({ value: v, label: v ? `${v / 1000} s` : 'instant' }))}
        />
      </Row>

      <Row title="While solving" desc="Hide the running time if watching it distracts you.">
        <Segmented
          id="upd"
          label="Timer display while solving"
          value={s.timerUpdate}
          onChange={(v) => setSettings({ timerUpdate: v })}
          options={[
            { value: 'live', label: 'live' },
            { value: 'seconds', label: 'seconds' },
            { value: 'hidden', label: 'hidden' },
          ]}
        />
      </Row>

      <Row title="Phases" desc="Tap space at the end of each phase; the last tap stops. Four phases are labelled cross, F2L, OLL and PLL.">
        <Segmented
          id="phases"
          label="Phases"
          value={s.phases}
          onChange={(v) => setSettings({ phases: v })}
          options={[1, 2, 3, 4].map((v) => ({ value: v, label: v === 1 ? 'off' : String(v) }))}
        />
      </Row>

      <Row title="Precision and preview">
        <Segmented id="dec" label="Decimals" value={s.decimals} onChange={(v) => setSettings({ decimals: v })} options={[{ value: 2, label: '0.01' }, { value: 3, label: '0.001' }]} />
        <span className="dim" style={{ fontSize: 14, marginLeft: 12 }}>Scramble preview</span>
        <Switch label="Scramble preview" checked={s.scramblePreview} onChange={(v) => setSettings({ scramblePreview: v })} />
      </Row>

      <h2 className="setting-group">Coach</h2>
      <Row title="Coach" desc="After a 10-minute break, sums up the sitting you just finished. In Insights, names what costs you the most time and suggests a drill for it. Off by default, so the timer stays plain.">
        <Switch label="Coach" checked={s.coach} onChange={(v) => setSettings({ coach: v })} />
      </Row>

      <h2 className="setting-group">Devices</h2>
      <Row
        id="devices"
        title="Timers and smart cubes"
        desc={
          bt
            ? devices.cube
              ? `Connected: ${devices.cube.name}${devices.cube.battery != null ? `, ${devices.cube.battery}%` : ''}.`
              : devices.external
                ? `Connected: ${devices.external.name}.`
                : devices.connecting
                  ? `Connecting the ${devices.connecting}…`
                  : 'Nothing connected. The keyboard and touch always work.'
            : 'Bluetooth is not available in this browser. Use the desktop app, or Chrome or Edge. The Stackmat works everywhere.'
        }
      >
        <ScrollHere when={location.hash.endsWith('?devices')} />
        <button type="button" className="btn" onClick={() => { disconnectCube(); setSettings({ input: 'stackmat' }); void connectExternal('stackmat') }}>Stackmat</button>
        {bt && (
          <>
            <button type="button" className="btn" onClick={() => { disconnectCube(); setSettings({ input: 'gantimer' }); void connectExternal('gantimer') }}>GAN timer</button>
            <button type="button" className="btn" onClick={() => cube('gan')}>GAN cube</button>
            <button type="button" className="btn" onClick={() => cube('moyu32')}>MoYu V10 AI / MoYu32</button>
            <button type="button" className="btn" onClick={() => cube('moyu')}>MoYu WeiLong AI</button>
            <button type="button" className="btn" onClick={() => cube('other')}>GiiKER, GoCube, QiYi, HeyKube</button>
          </>
        )}
        {(devices.cube || devices.external) && (
          <button type="button" className="btn danger" onClick={() => { disconnectCube(); disconnectExternal(); setSettings({ input: 'keyboard' }) }}>
            Disconnect
          </button>
        )}
      </Row>

      <Row title="Track cube rotations" desc="Smart cubes with a gyroscope (MoYu V10 AI, some GAN cubes) turn the on-screen cube with yours. Uses a little more of the cube's battery. Applies the next time the cube connects.">
        <Switch label="Track cube rotations" checked={s.trackRotations} onChange={(v) => setSettings({ trackRotations: v })} />
      </Row>

      <h2 className="setting-group">Your data</h2>
      <Row id="import" title="Import from csTimer" desc="In csTimer open Export, choose Export to file, then pick that file here or drop it anywhere on this page. A Cadence backup works too. You see what is in it before anything is added. Solves you already have are skipped, and sessions with the same name are topped up.">
        <ScrollHere when={location.hash.endsWith('?import')} />
        <input ref={file} type="file" accept=".json,.txt,application/json,text/plain" className="visually-hidden" id="import-file" onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
        <button type="button" className="btn primary" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? 'Importing…' : 'Choose file'}
        </button>
      </Row>

      <Row title="Export" desc="A full backup of every session, or a file csTimer can import.">
        <button type="button" className="btn" onClick={() => void exportAll('backup')}>Backup (.json)</button>
        <button type="button" className="btn" onClick={() => void exportAll('cstimer')}>csTimer format</button>
      </Row>

      <Row title="Delete everything" desc="Removes all sessions and solves from this device and signs it out of sync, so your account keeps its copy. Settings stay.">
        <button type="button" className="btn danger" onClick={() => setConfirmClear(true)}>Delete all data</button>
      </Row>

      <Row title="Share diagnostics" desc="Off unless you turn it on. When on, Cadence sends device connection steps and error messages to help fix bugs with your timer or cube. It never sends your solves, times or name.">
        <Switch label="Share diagnostics" checked={s.shareDiagnostics} onChange={(v) => setSettings({ shareDiagnostics: v })} />
      </Row>

      <Row title={`About Cadence ${__APP_VERSION__}`} desc="Free software under the GNU GPL v3 or later. If Cadence helps your solving, a star, a share or a coffee all help it grow.">
        <p className="dim" style={{ fontSize: 14, margin: 0, maxWidth: 560 }}>
          Scrambles and 3D cubes by cubing.js. GAN Bluetooth by gan-web-bluetooth. MoYu and GAN timer drivers, the Stackmat protocol and the inspection voices are adapted from csTimer by Shuang Chen.
        </p>
        <WhatsNew />
        <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">Star on GitHub</a>
        <button type="button" className="btn" onClick={() => void shareCadence()}>Share</button>
        <a className="btn" href="https://buymeacoffee.com/serendeep" target="_blank" rel="noreferrer">Buy me a coffee</a>
      </Row>

      <AnimatePresence>
        {preview && <ImportDialog preview={preview} onCancel={() => setPreview(null)} onConfirm={() => void confirmImport(preview)} />}
      </AnimatePresence>

      <AnimatePresence>
        {confirmClear && (
          <Dialog title="Delete all sessions and solves?" onClose={() => setConfirmClear(false)}>
            <p className="dim">This cannot be undone. Export a backup first if you might want them back.</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>Keep my data</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirmClear(false)
                  void signOut().then(clearAll).then(() => {
                    setSettings({ sessionId: null })
                    toast('All data deleted')
                  })
                }}
              >
                Delete everything
              </button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  )
}
