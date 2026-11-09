import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db, ensureSession, onSolveDeleted, sessionSolves } from '../lib/db'
import { setSettings, useSettings } from '../lib/settings'
import { sessionStats } from '../lib/stats'
import { solveValue } from '../lib/time'
import type { Session, Solve } from '../lib/types'

export interface SessionData {
  sessions: Session[]
  session: Session | undefined
  solves: Solve[]
  values: number[]
  stats: ReturnType<typeof sessionStats>
  loading: boolean
}

const NO_SOLVES: Solve[] = []

/** The active session, its solves in time order, and their statistics, all live from IndexedDB. */
export function useSessionData(): SessionData {
  const { sessionId } = useSettings()
  const sessions = useLiveQuery(() => db.sessions.orderBy('order').toArray(), [])

  useEffect(() => {
    if (!sessions) return
    if (sessionId != null && sessions.some((s) => s.id === sessionId)) return
    void ensureSession().then((id) => setSettings({ sessionId: id }))
  }, [sessions, sessionId])

  const session = sessions?.find((s) => s.id === sessionId)
  const history = useLiveQuery(() => (session?.id != null ? sessionSolves(session.id) : NO_SOLVES), [session?.id]) ?? NO_SOLVES
  const [deleted, setDeleted] = useState<ReadonlySet<number>>(() => new Set())
  useEffect(() => onSolveDeleted((id) => setDeleted((ids) => new Set([...ids, id]))), [])
  // A large IndexedDB history can take a second to reload; reflect confirmed deletions straight away.
  const solves = useMemo(
    () => deleted.size ? history.filter((solve) => solve.id == null || !deleted.has(solve.id)) : history,
    [history, deleted],
  )
  // Once the query catches up, its rows become the sole source of truth again.
  if (deleted.size && !history.some((solve) => solve.id != null && deleted.has(solve.id))) {
    setDeleted(new Set())
  }
  const values = useMemo(() => solves.map(solveValue), [solves])
  const stats = useMemo(() => sessionStats(values), [values])
  return { sessions: sessions ?? [], session, solves, values, stats, loading: !sessions }
}

/** Solve count per session id, live; empty while loading. */
export function useSessionCounts(): ReadonlyMap<number, number> {
  return useLiveQuery(async () => {
    const ids = await db.sessions.toCollection().primaryKeys()
    return new Map(await Promise.all(ids.map(async (id) => [id, await db.solves.where('sessionId').equals(id).count()] as const)))
  }, []) ?? NO_COUNTS
}

const NO_COUNTS: ReadonlyMap<number, number> = new Map()

/** Every solve of one event across sessions, in date order, leaving out drill practice; undefined while loading. */
export function useEventSolves(event: string, enabled = true): Solve[] | undefined {
  return useLiveQuery(() => (enabled ? db.solves.orderBy('date').filter((s) => s.event === event && !s.drill).toArray() : NO_SOLVES), [event, enabled])
}
