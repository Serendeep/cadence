import { db } from './db'
import { makeBackup } from './importExport'

interface BackupBridge {
  saveBackup: (json: string) => Promise<boolean>
  openBackups: () => Promise<void>
}

const DAY_KEY = 'cadence:backup-day'
// the app can stay open past midnight; check now and then for a new day
const CHECK_MS = 60 * 60 * 1000

function bridge(): BackupBridge | undefined {
  const d = (window as unknown as { desktop?: Partial<BackupBridge> }).desktop
  return d?.saveBackup && d.openBackups ? (d as BackupBridge) : undefined
}

export const hasAutoBackups = (): boolean => bridge() !== undefined

export function openBackups(): void {
  void bridge()?.openBackups()
}

function lastDay(): string | null {
  try {
    return localStorage.getItem(DAY_KEY)
  } catch {
    return null
  }
}

async function backupOncePerDay(desktop: BackupBridge): Promise<void> {
  const today = new Date().toDateString()
  if (lastDay() === today) return
  const [sessions, solves] = await Promise.all([db.sessions.orderBy('order').toArray(), db.solves.orderBy('date').toArray()])
  // an empty database would push real backups out of the seven kept
  if (solves.length === 0) return
  if (!(await desktop.saveBackup(JSON.stringify(makeBackup(sessions, solves))))) return
  try {
    localStorage.setItem(DAY_KEY, today)
  } catch {
    // storage blocked: the backup runs again on the next check and overwrites today's file
  }
}

/** On the desktop app, saves a backup file once a calendar day. */
export function startDesktopBackups(): void {
  const desktop = bridge()
  if (!desktop) return
  const run = () => backupOncePerDay(desktop).catch((e: unknown) => console.warn('Automatic backup failed', e))
  void run()
  window.setInterval(run, CHECK_MS)
}
