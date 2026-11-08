import { useSyncExternalStore } from 'react'
import { db, onDbChange, withoutChangeEvents } from './db'
import { finite, isObj, solveFields } from './importExport'
import { getSettings, setSettings, subscribeSettings, type Settings } from './settings'
import { toast } from './toast'
import type { Session, Solve } from './types'

// pages served by the Worker share its origin; the desktop app (app://) and the Vite dev server call production
const API = globalThis.location?.protocol === 'app:' || import.meta.env.DEV ? 'https://timer.serendeep.app' : ''
const STORE = 'cadence:sync'
// set just before leaving for the WCA site; the sign-in that comes back must carry the same value
const PENDING_SIGN_IN = 'cadence:sign-in'
const SIGN_IN_TTL_MS = 15 * 60 * 1000
// the server's per-request maximum; fewer requests keeps a first sync of a big history under the rate limit
const CHUNK = 500
// the server allows 120 requests a minute; a big first sync waits this long and retries rather than starting over later
const RATE_LIMIT_WAIT_MS = 15_000
const RATE_LIMIT_RETRIES = 12
const DEBOUNCE_MS = 2000
const PERIODIC_MS = 5 * 60 * 1000
// re-send edits from just before the last push, in case one was being written while that push read the database
const PUSH_OVERLAP_MS = 1000
// these describe this device, not the solver, so they never sync
const LOCAL_ONLY: readonly (keyof Settings)[] = ['input', 'sessionId', 'shareDiagnostics', 'drill']

type Kind = 'session' | 'solve' | 'settings'
export interface SyncRecord {
  kind: Kind
  uid: string
  updated: number
  deleted: boolean
  data?: Record<string, unknown>
}
interface SyncResponse {
  version: number
  more: boolean
  changes: SyncRecord[]
}

export interface Account {
  name: string
  wcaId: string | null
  avatar: string | null
}

export interface SyncState {
  token: string | null
  account: Account | null
  /** Server version already pulled */
  version: number
  /** Local edits newer than this still need pushing; -1 before the first push */
  pushedAt: number
  /** Last time a synced setting changed, here or on another device */
  settingsUpdated: number
  lastSynced: number | null
  status: 'idle' | 'syncing' | 'error'
  /** Set while asking whether this device's solves, from another account, may go into the account being signed into */
  switching: { from: string; to: string } | null
}

const SIGNED_OUT: SyncState = { token: null, account: null, version: 0, pushedAt: -1, settingsUpdated: 0, lastSynced: null, status: 'idle', switching: null }
// the last account this device synced with, kept after signing out, so a different account can be noticed
const LAST_ACCOUNT = 'cadence:last-account'

function lastAccount(): { id: number; name: string } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LAST_ACCOUNT) ?? 'null')
    return isObj(raw) && finite(raw.id) && typeof raw.name === 'string' ? { id: raw.id, name: raw.name } : null
  } catch {
    return null
  }
}

function load(): SyncState {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    return isObj(raw) ? { ...SIGNED_OUT, ...(raw as Partial<SyncState>), status: 'idle', switching: null } : SIGNED_OUT
  } catch {
    return SIGNED_OUT
  }
}

let state = load()
const listeners = new Set<() => void>()

function update(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(STORE, JSON.stringify(state))
  } catch {
    // storage blocked: sync still works until the page closes
  }
  listeners.forEach((l) => l())
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const isSignedIn = (): boolean => state.token !== null

class SignedOut extends Error {}
class StorageFull extends Error {}
class RateLimited extends Error {}

async function api<T>(path: string, init: RequestInit = {}, token = state.token): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  if (res.status === 401) throw new SignedOut()
  if (res.status === 507) throw new StorageFull()
  if (res.status === 429) throw new RateLimited()
  if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  return (await res.json()) as T
}

const syncedSettings = (s: Settings): Record<string, unknown> =>
  Object.fromEntries(Object.entries(s).filter(([k]) => !LOCAL_ONLY.includes(k as keyof Settings)))

/** Everything edited here since the last push, sessions first so a receiving device can file solves under them. */
async function localChanges(): Promise<SyncRecord[]> {
  const [allSessions, solves, tombstones] = await Promise.all([db.sessions.toArray(), db.solves.where('updated').above(state.pushedAt).toArray(), db.tombstones.toArray()])
  const sessionUid = new Map(allSessions.map((s) => [s.id, s.uid]))
  const live = new Set([...allSessions, ...solves].map((r) => r.uid))
  const sessions = allSessions.filter((s) => (s.updated ?? 0) > state.pushedAt)
  const out: SyncRecord[] = sessions.map(({ id: _id, uid, updated, ...data }) => ({ kind: 'session', uid: uid!, updated: updated ?? 0, deleted: false, data: { ...data } }))
  for (const { id: _id, uid, updated, sessionId, ...data } of solves) {
    const parent = sessionUid.get(sessionId)
    if (parent) out.push({ kind: 'solve', uid: uid!, updated: updated ?? 0, deleted: false, data: { ...data, sessionUid: parent } })
  }
  // a tombstone for a row that exists again (restored with Undo) is stale
  out.push(...tombstones.filter((t) => !live.has(t.uid)).map((t) => ({ kind: t.kind, uid: t.uid, updated: t.updated, deleted: true })))
  if (state.pushedAt < 0 || state.settingsUpdated > state.pushedAt) {
    // never-edited settings go up as 1, so a device signing in later adopts the account's settings instead of overwriting them
    out.push({ kind: 'settings', uid: 'settings', updated: Math.max(state.settingsUpdated, 1), deleted: false, data: syncedSettings(getSettings()) })
  }
  return out
}

function cleanSession(d: Record<string, unknown>): Omit<Session, 'id' | 'uid' | 'updated'> | null {
  if (typeof d.name !== 'string' || typeof d.event !== 'string') return null
  return { name: d.name, event: d.event, created: finite(d.created) ? d.created : Date.now(), order: finite(d.order) ? d.order : 0 }
}

/** Newest edit wins; a local deletion newer than the incoming edit wins too. */
async function isNewer<T extends Session | Solve>(rec: SyncRecord, local: T | undefined): Promise<boolean> {
  if (local && (local.updated ?? 0) >= rec.updated) return false
  const tomb = await db.tombstones.get(rec.uid)
  return !tomb || tomb.updated < rec.updated
}

async function applySession(rec: SyncRecord): Promise<void> {
  const local = await db.sessions.where('uid').equals(rec.uid).first()
  if (!(await isNewer(rec, local))) return
  if (rec.deleted) {
    if (local?.id == null) return
    const unsynced = await db.solves.where('sessionId').equals(local.id).filter((s) => (s.updated ?? 0) > state.pushedAt).count()
    // deleted on another device while new solves were recorded here: keep the session, and its fresh edit time brings it back everywhere
    if (unsynced > 0) return void (await db.sessions.update(local.id, { updated: Date.now() }))
    await db.solves.where('sessionId').equals(local.id).delete()
    await db.sessions.delete(local.id)
    return
  }
  const fields = rec.data && cleanSession(rec.data)
  if (!fields) return
  if (local?.id != null) await db.sessions.update(local.id, { ...fields, updated: rec.updated })
  else await db.sessions.add({ ...fields, uid: rec.uid, updated: rec.updated })
}

async function applySolve(rec: SyncRecord): Promise<void> {
  const local = await db.solves.where('uid').equals(rec.uid).first()
  if (!(await isNewer(rec, local))) return
  if (rec.deleted) {
    if (local?.id != null) await db.solves.delete(local.id)
    return
  }
  const fields = rec.data && solveFields(rec.data)
  const parent = typeof rec.data?.sessionUid === 'string' ? await db.sessions.where('uid').equals(rec.data.sessionUid).first() : undefined
  // no session means it was deleted here; its solves go with it
  if (!fields || parent?.id == null) return
  const row = { ...fields, sessionId: parent.id, updated: rec.updated }
  if (local?.id != null) await db.solves.update(local.id, row)
  else await db.solves.add({ ...row, uid: rec.uid })
}

let applyingSettings = false

async function applyRemote(changes: SyncRecord[]): Promise<void> {
  const byKind = (k: Kind) => changes.filter((c) => c.kind === k)
  await withoutChangeEvents(() =>
    db.transaction('rw', db.sessions, db.solves, db.tombstones, async () => {
      for (const c of byKind('session')) await applySession(c)
      for (const c of byKind('solve')) await applySolve(c)
    }),
  )
  const settings = byKind('settings').at(-1)
  if (settings?.data && settings.updated > state.settingsUpdated) {
    applyingSettings = true
    setSettings(syncedSettings(settings.data as unknown as Settings) as Partial<Settings>)
    applyingSettings = false
    update({ settingsUpdated: settings.updated })
  }
}

async function postSync(batch: SyncRecord[]): Promise<SyncResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<SyncResponse>('/api/sync', { method: 'POST', body: JSON.stringify({ since: state.version, changes: batch }) })
    } catch (e) {
      if (!(e instanceof RateLimited) || attempt >= RATE_LIMIT_RETRIES) throw e
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS))
    }
  }
}

let running: Promise<void> | null = null
let again = false

// half the server's 8 MB body limit, so long smart cube move logs never make a batch fail on every attempt
const BATCH_BYTES = 4 * 1024 * 1024

/** How many of the next records fit in one request: at most CHUNK, and under BATCH_BYTES (always at least one). */
export function batchSize(records: readonly SyncRecord[]): number {
  let bytes = 0
  let n = 0
  while (n < records.length && n < CHUNK) {
    bytes += JSON.stringify(records[n]).length
    if (n > 0 && bytes > BATCH_BYTES) break
    n++
  }
  return n
}

async function pushAndPull(): Promise<void> {
  const startedAt = Date.now()
  let pending = await localChanges()
  const pushedTombstones = pending.filter((c) => c.deleted)
  let more = true
  while (pending.length || more) {
    const size = batchSize(pending)
    const batch = pending.slice(0, size)
    pending = pending.slice(size)
    const res = await postSync(batch)
    await applyRemote(res.changes)
    update({ version: res.version })
    more = res.more
  }
  // the server has them now; keep any that were replaced by a newer deletion meanwhile
  await db.transaction('rw', db.tombstones, async () => {
    for (const t of pushedTombstones) if ((await db.tombstones.get(t.uid))?.updated === t.updated) await db.tombstones.delete(t.uid)
  })
  update({ pushedAt: startedAt - PUSH_OVERLAP_MS, lastSynced: Date.now() })
}

/** Pushes local edits and pulls everything new; overlapping calls run once more afterwards. */
export async function syncNow(): Promise<void> {
  if (!state.token) return
  if (running) {
    again = true
    return running
  }
  update({ status: 'syncing' })
  running = (async () => {
    try {
      do {
        again = false
        await pushAndPull()
      } while (again)
      update({ status: 'idle' })
    } catch (e) {
      if (e instanceof SignedOut) {
        forget()
        toast('Signed out of sync. Sign in again in Settings to keep your devices in step.', undefined, 8000)
      } else {
        if (e instanceof StorageFull) toast('Your account has reached its sync storage limit. New solves stay on this device.', undefined, 8000)
        update({ status: 'error' })
      }
    } finally {
      running = null
    }
  })()
  return running
}

let timer = 0
function schedule(delay = DEBOUNCE_MS): void {
  if (!state.token) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void syncNow(), delay)
}

let answerSwitch: ((merge: boolean) => void) | null = null

/** The Settings dialog's answer to `switching`: true uploads this device's solves into the new account. */
export function resolveAccountSwitch(merge: boolean): void {
  answerSwitch?.(merge)
  answerSwitch = null
}

async function finishSignIn(token: string): Promise<void> {
  try {
    // the token is only kept once the account is settled, so nothing syncs while the question is open
    const me = await api<Account & { id: number }>('/api/me', {}, token)
    const previous = lastAccount()
    if (previous && previous.id !== me.id && (await db.solves.count()) > 0) {
      update({ switching: { from: previous.name, to: me.name } })
      const merge = await new Promise<boolean>((resolve) => (answerSwitch = resolve))
      update({ switching: null })
      if (!merge) {
        await api('/api/auth/logout', { method: 'POST' }, token).catch(() => undefined)
        toast(`Not signed in. Nothing from this device went to ${me.name}'s account.`, undefined, 8000)
        return
      }
    }
    try {
      localStorage.setItem(LAST_ACCOUNT, JSON.stringify({ id: me.id, name: me.name }))
    } catch {
      // storage blocked: the next sign-in simply cannot compare accounts
    }
    update({ ...SIGNED_OUT, token, settingsUpdated: state.settingsUpdated, account: { name: me.name, wcaId: me.wcaId, avatar: me.avatar } })
    toast(`Signed in as ${me.name}. Syncing your solves.`)
    await syncNow()
  } catch {
    toast(SIGN_IN_ERRORS.failed)
  }
}

const SIGN_IN_ERRORS: Record<string, string> = {
  denied: 'Sign-in was cancelled on the WCA site.',
  expired: 'Sign-in took too long. Try again.',
  failed: 'The WCA sign-in did not work. Try again in a minute.',
}

/** Signs in with the WCA website: in a window of its own on desktop, by leaving the page and coming back on the web. */
export async function signIn(): Promise<void> {
  const desktop = (window as Window & { desktop?: { signIn?: () => Promise<{ token?: string; error?: string }> } }).desktop
  if (!desktop?.signIn) {
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
    try {
      localStorage.setItem(PENDING_SIGN_IN, JSON.stringify({ nonce, at: Date.now() }))
    } catch {
      toast('Sign-in needs site storage, which this browser has blocked.')
      return
    }
    location.href = `${API}/api/auth/wca/login?nonce=${nonce}`
    return
  }
  const result = await desktop.signIn()
  if (result.token) await finishSignIn(result.token)
  else if (result.error && result.error !== 'closed') toast(SIGN_IN_ERRORS[result.error] ?? SIGN_IN_ERRORS.failed)
}

function forget(): void {
  update({ ...SIGNED_OUT, settingsUpdated: state.settingsUpdated })
}

/** Signs this device out; its solves stay here and in the account. */
export async function signOut(): Promise<void> {
  if (state.token) await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
  forget()
}

/** Erases everything the account holds on the server and signs out every device; this device keeps its own copy. */
export async function deleteAccountData(): Promise<void> {
  await api('/api/account', { method: 'DELETE' })
  forget()
}

/** True when this browser started a sign-in in the last few minutes with this nonce; each nonce works once. */
function takePendingSignIn(nonce: string | null): boolean {
  try {
    const pending: unknown = JSON.parse(localStorage.getItem(PENDING_SIGN_IN) ?? 'null')
    localStorage.removeItem(PENDING_SIGN_IN)
    return isObj(pending) && !!nonce && pending.nonce === nonce && finite(pending.at) && Date.now() - pending.at < SIGN_IN_TTL_MS
  } catch {
    return false
  }
}

/**
 * The web sign-in comes back as #/settings?auth=<token>&nonce=<n>; take the token out of the address bar straight away.
 * A token is only accepted with the nonce this browser stored, so a link carrying someone else's token cannot sign you in.
 */
function readRedirect(): void {
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const token = params.get('auth')
  const failure = params.get('auth-error')
  if (!token && !failure) return
  history.replaceState(null, '', `${location.pathname}#/settings/account`)
  if (failure) toast(SIGN_IN_ERRORS[failure] ?? SIGN_IN_ERRORS.failed)
  else if (takePendingSignIn(params.get('nonce'))) void finishSignIn(token!)
  else toast('That sign-in link was not started on this device, so it was ignored.')
}

export function startSync(): void {
  readRedirect()
  let lastSettings = JSON.stringify(syncedSettings(getSettings()))
  subscribeSettings(() => {
    const now = JSON.stringify(syncedSettings(getSettings()))
    if (now === lastSettings) return
    lastSettings = now
    if (applyingSettings) return
    update({ settingsUpdated: Date.now() })
    schedule()
  })
  onDbChange(() => schedule())
  window.addEventListener('online', () => schedule(0))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0)
  })
  window.setInterval(() => schedule(0), PERIODIC_MS)
  schedule(0)
}
