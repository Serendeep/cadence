import Dexie, { type Table } from 'dexie'
import type { ImportedData } from './importExport'
import type { Session, Solve, Synced } from './types'

/** A deletion waiting to reach the other signed-in devices. */
export interface Tombstone {
  uid: string
  kind: 'session' | 'solve'
  updated: number
}

const changeListeners = new Set<() => void>()
let quiet = false

/** Calls `l` after local edits to sessions or solves, but not after writes that came from sync. */
export function onDbChange(l: () => void): () => void {
  changeListeners.add(l)
  return () => changeListeners.delete(l)
}

/** Runs writes that came from another device without reporting them as local edits. */
export async function withoutChangeEvents<T>(fn: () => Promise<T>): Promise<T> {
  quiet = true
  try {
    return await fn()
  } finally {
    quiet = false
  }
}

const changed = () => {
  if (!quiet) changeListeners.forEach((l) => l())
}

function stampWrites<T extends Synced>(table: Table<T, number>) {
  // Dexie hooks work by filling in the object being created
  table.hook('creating', (_key, obj) => {
    obj.uid ??= crypto.randomUUID()
    obj.updated ??= Date.now()
    changed()
  })
  table.hook('updating', (mods) => {
    changed()
    return 'updated' in mods ? undefined : { updated: Date.now() }
  })
  table.hook('deleting', changed)
}

class TimerDB extends Dexie {
  sessions!: Table<Session, number>
  solves!: Table<Solve, number>
  tombstones!: Table<Tombstone, string>

  constructor() {
    super('better-cstimer')
    this.version(1).stores({
      sessions: '++id, order',
      solves: '++id, sessionId, date, [sessionId+date]',
    })
    this.version(2)
      .stores({
        sessions: '++id, order, &uid, updated',
        solves: '++id, sessionId, date, [sessionId+date], &uid, updated',
        tombstones: '&uid',
      })
      .upgrade(async (tx) => {
        // existing rows get a stable id; updated 0 means not edited since sync existed, so any later edit wins
        const stamp = (row: Synced) => {
          row.uid = crypto.randomUUID()
          row.updated = 0
        }
        await tx.table('sessions').toCollection().modify(stamp)
        await tx.table('solves').toCollection().modify(stamp)
      })
    stampWrites(this.sessions)
    stampWrites(this.solves)
  }
}

export const db = new TimerDB()

export async function ensureSession(): Promise<number> {
  const first = await db.sessions.orderBy('order').first()
  if (first?.id != null) return first.id
  return db.sessions.add({ name: 'Main', event: '333', created: Date.now(), order: 0 })
}

export async function createSession(name: string, event: string): Promise<number> {
  const last = await db.sessions.orderBy('order').last()
  return db.sessions.add({ name, event, created: Date.now(), order: (last?.order ?? -1) + 1 })
}

export const updateSession = (id: number, patch: Partial<Session>) => db.sessions.update(id, patch)

const tombstonesFor = (kind: Tombstone['kind'], rows: Synced[]): Tombstone[] =>
  rows.flatMap((r) => (r.uid ? [{ uid: r.uid, kind, updated: Date.now() }] : []))

export async function deleteSession(id: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, db.tombstones, async () => {
    const solves = await db.solves.where('sessionId').equals(id).toArray()
    const session = await db.sessions.get(id)
    await db.tombstones.bulkPut([...tombstonesFor('solve', solves), ...tombstonesFor('session', session ? [session] : [])])
    await db.solves.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

// a fresh edit time, so a solve restored with Undo beats the deletion it reverses
export const addSolve = (s: Omit<Solve, 'id'>) => db.solves.add({ ...s, updated: Date.now() })
export const updateSolve = (id: number, patch: Partial<Solve>) => db.solves.update(id, patch)

export async function deleteSolve(id: number): Promise<void> {
  await db.transaction('rw', db.solves, db.tombstones, async () => {
    const solve = await db.solves.get(id)
    await db.tombstones.bulkPut(tombstonesFor('solve', solve ? [solve] : []))
    await db.solves.delete(id)
  })
}

export const sessionSolves = (sessionId: number) => db.solves.where('[sessionId+date]').between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]).toArray()

/** The existing session an imported one adds to: same name and event, so a fresh csTimer export tops up what is here. */
export const matchSession = (existing: readonly Session[], s: Pick<Session, 'name' | 'event'>) => existing.find((e) => e.name === s.name && e.event === s.event)

/** Adds imported solves in one transaction, into matching sessions or new ones; returns their session ids, in file order. */
export async function importData(data: ImportedData): Promise<number[]> {
  return db.transaction('rw', db.sessions, db.solves, async () => {
    const existing = await db.sessions.toArray()
    let order = Math.max(-1, ...existing.map((s) => s.order)) + 1
    const ids: number[] = []
    for (const s of data.sessions) ids.push(matchSession(existing, s)?.id ?? (await db.sessions.add({ ...s, order: order++ })))
    const rows = data.solves.map(({ sessionIndex, ...rest }) => ({ ...rest, sessionId: ids[sessionIndex] }))
    await db.solves.bulkAdd(rows)
    return ids
  })
}

/** Empties this device only; callers sign out of sync first so the account keeps its copy. */
export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, db.tombstones, async () => {
    await db.solves.clear()
    await db.sessions.clear()
    await db.tombstones.clear()
  })
}
