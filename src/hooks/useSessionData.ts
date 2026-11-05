import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db, ensureSession, sessionSolves } from '../lib/db'
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
  const solves = useLiveQuery(() => (session?.id != null ? sessionSolves(session.id) : NO_SOLVES), [session?.id]) ?? NO_SOLVES
  const values = useMemo(() => solves.map(solveValue), [solves])
  const stats = useMemo(() => sessionStats(values), [values])
  return { sessions: sessions ?? [], session, solves, values, stats, loading: !sessions }
}
