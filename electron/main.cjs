const { app, BrowserWindow, ipcMain, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { updateMode } = require('./updateMode.cjs')
const { saveBackup } = require('./backups.cjs')

const DIST = path.join(__dirname, '..', 'dist')
const DEV_URL = process.env.VITE_DEV_SERVER_URL

// the app was called better-cstimer first; keep reading the solves stored under that folder
const legacyData = path.join(app.getPath('appData'), 'better-cstimer')
if (fs.existsSync(legacyData)) app.setPath('userData', legacyData)

// Web Bluetooth (and watchAdvertisements for MoYu MAC discovery) sit behind this switch on Linux.
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

// A standard, secure scheme gives the bundled app a real origin: IndexedDB, module workers and Bluetooth all need one.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

function serveDist() {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    // refuse anything that escapes dist/, and fall back to index.html for client routes
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 })
    const target = path.extname(file) ? file : path.join(DIST, 'index.html')
    // cubing.js probes a worker URL that bundling removes before falling back; answer it with a plain 404
    if (!fs.existsSync(target)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(target).toString())
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#141416',
    autoHideMenuBar: true,
    title: 'Cadence',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Electron has no built-in Bluetooth chooser: forward the device list to the renderer's picker.
  let pending = null
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    pending = callback
    win.webContents.send('bluetooth-devices', devices.map((d) => ({ id: d.deviceId, name: d.deviceName || 'Unnamed device' })))
  })
  const onSelect = (_e, id) => {
    if (pending) pending(typeof id === 'string' ? id : '')
    pending = null
  }
  ipcMain.on('bluetooth-select', onSelect)
  win.on('closed', () => ipcMain.off('bluetooth-select', onSelect))

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('app://')
    if (!allowed) e.preventDefault()
  })

  void win.loadURL(DEV_URL ?? 'app://bundle/')
}

const SITE = 'https://timer.serendeep.app'

const WCA = 'https://www.worldcubeassociation.org'
let signingIn = null

/** WCA sign-in in its own window; the Worker ends it at /auth/desktop#token=… or #error=…, which never loads. */
function signIn(parent) {
  // a second click while the window is open joins the sign-in already running
  if (signingIn) return signingIn
  signingIn = new Promise((resolve) => {
    // a partition without "persist:" lives in memory, so the WCA session is gone when the window closes
    const win = new BrowserWindow({ parent, modal: true, width: 520, height: 720, autoHideMenuBar: true, title: 'Sign in with WCA', webPreferences: { sandbox: true, contextIsolation: true, partition: 'wca-sign-in' } })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
      if (!win.isDestroyed()) win.close()
    }
    const watch = (e, url) => {
      if (url.startsWith(`${WCA}/`)) return
      if (!url.startsWith(`${SITE}/`)) return e.preventDefault()
      if (url.startsWith(`${SITE}/api/`)) return
      // any other page on the site means the sign-in ended; only /auth/desktop carries a result
      e.preventDefault()
      if (!url.startsWith(`${SITE}/auth/desktop`)) return finish({ error: 'failed' })
      const params = new URLSearchParams(new URL(url).hash.slice(1))
      finish(params.get('token') ? { token: params.get('token') } : { error: params.get('error') ?? 'failed' })
    }
    win.webContents.on('will-redirect', watch)
    win.webContents.on('will-navigate', watch)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.on('closed', () => finish({ error: 'closed' }))
    void win.loadURL(`${SITE}/api/auth/wca/login?client=desktop`)
  }).finally(() => {
    signingIn = null
  })
  return signingIn
}

ipcMain.handle('auth-sign-in', (e) => {
  // only the app's own page may start a sign-in, never a frame inside it
  if (e.senderFrame !== e.sender.mainFrame) return { error: 'failed' }
  return signIn(BrowserWindow.fromWebContents(e.sender))
})

const backupsDir = () => path.join(app.getPath('userData'), 'backups')

ipcMain.handle('backup-save', (e, json) => {
  if (e.senderFrame !== e.sender.mainFrame) return false
  try {
    return saveBackup(backupsDir(), json)
  } catch (err) {
    console.error('Backup failed:', err?.message ?? err)
    return false
  }
})

ipcMain.handle('backup-open', async (e) => {
  if (e.senderFrame !== e.sender.mainFrame) return
  fs.mkdirSync(backupsDir(), { recursive: true })
  await shell.openPath(backupsDir())
})

const RELEASES_URL = 'https://github.com/Serendeep/cadence/releases/latest'
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000

function startUpdates() {
  const { autoUpdater } = require('electron-updater')
  const mode = updateMode(process.platform, process.env.APPIMAGE)
  autoUpdater.logger = null
  autoUpdater.autoDownload = mode === 'install'
  const tell = (msg) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('update', msg))
  autoUpdater.on('update-available', (info) => {
    if (mode === 'notify') tell({ kind: 'available', version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => tell({ kind: 'ready', version: info.version }))
  // offline or GitHub unreachable: try again on the next check, never bother the user
  autoUpdater.on('error', (e) => console.error('Update check failed:', e?.message ?? e))
  ipcMain.on('update-install', () => {
    if (mode === 'install') autoUpdater.quitAndInstall()
    else void shell.openExternal(RELEASES_URL)
  })
  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, UPDATE_CHECK_MS)
}

app.whenReady().then(() => {
  if (!DEV_URL) serveDist()
  createWindow()
  if (app.isPackaged) startUpdates()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
