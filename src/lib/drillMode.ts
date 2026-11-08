import { createSession, db, matchSession } from './db'
import { eventById } from './events'
import { getSettings, setSettings } from './settings'
import type { DrillKind } from './types'

/** Switches to the event's drill session, creating it on first use, and puts the timer in drill mode. */
export async function startDrill(kind: DrillKind, event: string): Promise<void> {
  const name = `${eventById(event).short} drills`
  const sessionId = matchSession(await db.sessions.toArray(), { name, event })?.id ?? (await createSession(name, event))
  const { sessionId: current, drill } = getSettings()
  // switching drills keeps the session the first one left
  const returnTo = drill && current === drill.sessionId ? drill.returnTo : current
  setSettings({ sessionId, drill: { kind, sessionId, returnTo, cases: null } })
}

export function endDrill(): void {
  const { drill, sessionId } = getSettings()
  setSettings({ drill: null, sessionId: drill?.returnTo ?? sessionId })
}
