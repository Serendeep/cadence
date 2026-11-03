import Dexie, { type Table } from 'dexie'
import type { ImportedData } from './importExport'
import type { Session, Solve } from './types'

class TimerDB extends Dexie {
  sessions!: Table<Session, number>
  solves!: Table<Solve, number>

  constructor() {
    super('better-cstimer')
    this.version(1).stores({
      sessions: '++id, order',
      solves: '++id, sessionId, date, [sessionId+date]',
    })
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

export async function deleteSession(id: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, async () => {
    await db.solves.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

export const addSolve = (s: Omit<Solve, 'id'>) => db.solves.add(s)
export const updateSolve = (id: number, patch: Partial<Solve>) => db.solves.update(id, patch)
export const deleteSolve = (id: number) => db.solves.delete(id)

export const sessionSolves = (sessionId: number) => db.solves.where('[sessionId+date]').between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey]).toArray()

/** Adds imported sessions and solves in one transaction; returns how many solves were added. */
export async function importData(data: ImportedData): Promise<number> {
  return db.transaction('rw', db.sessions, db.solves, async () => {
    const last = await db.sessions.orderBy('order').last()
    const base = (last?.order ?? -1) + 1
    const ids: number[] = []
    for (const [i, s] of data.sessions.entries()) ids.push(await db.sessions.add({ ...s, order: base + i }))
    const rows = data.solves.map(({ sessionIndex, ...rest }) => ({ ...rest, sessionId: ids[sessionIndex] }))
    await db.solves.bulkAdd(rows)
    return rows.length
  })
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.sessions, db.solves, async () => {
    await db.solves.clear()
    await db.sessions.clear()
  })
}
