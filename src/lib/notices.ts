import { compareVersions } from './changelog'
import { db } from './db'
import { whenNotSolving } from './solving'
import { hasToast, toast } from './toast'

export const REPO_URL = 'https://github.com/Serendeep/cadence'
const SITE_URL = 'https://timer.serendeep.app'
const VERSION_KEY = 'cadence:version'
const SHOWN_KEY = 'cadence:notices'
const NOTICE_TOAST_MS = 60_000
const STAR_SOLVES = 100
const STAR_DAYS = 3
const SHARE_SOLVES = 300

interface Nudge {
  id: string
  ready: (solves: number, days: () => Promise<number>) => Promise<boolean>
  message: string
  action: { label: string; run: () => void }
}

const NUDGES: Nudge[] = [
  {
    id: 'star',
    ready: async (solves, days) => solves >= STAR_SOLVES && (await days()) >= STAR_DAYS,
    message: 'Enjoying Cadence? A star on GitHub helps other cubers find it.',
    action: { label: 'Star', run: () => window.open(REPO_URL, '_blank', 'noopener') },
  },
  {
    id: 'share',
    ready: async (solves) => solves >= SHARE_SOLVES,
    message: 'Know a cuber who would like Cadence? Send them a link.',
    action: { label: 'Share', run: () => void shareCadence() },
  },
]

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked: a notice may show again, which is harmless
  }
}

/** Opens the system share sheet, or copies the link where there is none. */
export async function shareCadence(): Promise<void> {
  const data = { title: 'Cadence', text: 'A free speedcubing timer that tells you what to practise.', url: SITE_URL }
  if (navigator.share) {
    // closing the sheet rejects too; nothing to report then
    await navigator.share(data).catch(() => undefined)
    return
  }
  await navigator.clipboard.writeText(SITE_URL).then(() => toast('Link copied'), () => toast(SITE_URL))
}

async function practiceDays(): Promise<number> {
  const dates = (await db.solves.orderBy('date').keys()) as number[]
  return new Set(dates.map((d) => new Date(d).toDateString())).size
}

/** Whether `current` is an update the person has not seen the notes for. A fresh install has nothing to report. */
export function isUpdate(seen: string | null, current: string, hasSolves: boolean): boolean {
  // installs from before this notice stored no version; their solves tell them apart from a new install
  return seen ? compareVersions(current, seen) > 0 : hasSolves
}

/** Shows at most one notice: what changed after an update, or the next nudge whose time has come. Each nudge shows once. */
export async function checkNotices(): Promise<void> {
  if (hasToast()) return
  const solves = await db.solves.count()
  const seen = read(VERSION_KEY)
  write(VERSION_KEY, __APP_VERSION__)
  if (isUpdate(seen, __APP_VERSION__, solves > 0)) {
    whenNotSolving(() => toast(`Updated to ${__APP_VERSION__}`, { label: "What's new", run: () => location.assign('#/settings?whats-new') }, NOTICE_TOAST_MS))
    return
  }
  const done = (read(SHOWN_KEY) ?? '').split(',').filter(Boolean)
  for (const n of NUDGES) {
    if (done.includes(n.id) || !(await n.ready(solves, practiceDays))) continue
    write(SHOWN_KEY, [...done, n.id].join(','))
    whenNotSolving(() => toast(n.message, n.action, NOTICE_TOAST_MS))
    return
  }
}
