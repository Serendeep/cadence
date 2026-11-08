import { DRILL_KINDS, type DrillKind, type InputSource, type Penalty, type Session, type Solve, type TimedMove } from './types'

/** cstimer scramble-type ids mapped to WCA / cubing.js event ids. */
const CSTIMER_EVENTS: Record<string, string> = {
  '333': '333', '222so': '222', '444wca': '444', '555wca': '555', '666wca': '666', '777wca': '777',
  '333ni': '333bf', '333fm': '333fm', '333oh': '333oh', clkwca: 'clock', mgmp: 'minx', pyrso: 'pyram',
  skbso: 'skewb', sqrs: 'sq1', '444bld': '444bf', '555bld': '555bf', r3ni: '333mbf',
}
const TO_CSTIMER = Object.fromEntries(Object.entries(CSTIMER_EVENTS).map(([k, v]) => [v, k]))

export interface ImportedData {
  sessions: Omit<Session, 'id'>[]
  /** Solves keyed by index into `sessions` instead of a DB id */
  solves: (Omit<Solve, 'id' | 'sessionId'> & { sessionIndex: number })[]
  skipped: number
}

export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function cstimerPenalty(p: unknown): Penalty | null {
  if (p === 0) return 'ok'
  if (p === 2000) return '+2'
  if (p === -1) return 'dnf'
  return null
}

function parseSessionMeta(props: Record<string, unknown>): Record<string, { name?: unknown; opt?: unknown }> {
  const raw = props.sessionData
  try {
    const data: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
    return isObj(data) ? (data as Record<string, { name?: unknown; opt?: unknown }>) : {}
  } catch {
    return {}
  }
}

/** Parses a cstimer "Export to file" JSON. Throws with a readable message when the file is not one. */
export function parseCstimer(json: unknown): ImportedData {
  if (!isObj(json)) throw new Error('This file is not a cstimer export.')
  const keys = Object.keys(json).filter((k) => /^session\d+$/.test(k))
  if (!keys.length) throw new Error('No cstimer sessions found in this file.')
  const meta = isObj(json.properties) ? parseSessionMeta(json.properties) : {}
  const out: ImportedData = { sessions: [], solves: [], skipped: 0 }
  keys.sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))

  for (const key of keys) {
    const rows = json[key]
    if (!Array.isArray(rows) || rows.length === 0) continue
    const num = key.slice(7)
    const m = meta[num] ?? {}
    const opt = isObj(m.opt) ? m.opt : {}
    const event = CSTIMER_EVENTS[String(opt.scrType ?? '333')] ?? '333'
    const name = m.name != null && String(m.name).trim() ? String(m.name) : `Session ${num}`
    const sessionIndex = out.sessions.length
    out.sessions.push({ name: /^\d+$/.test(name) ? `cstimer ${name}` : name, event, created: Date.now(), order: sessionIndex })

    for (const row of rows) {
      if (!Array.isArray(row) || !Array.isArray(row[0])) {
        out.skipped++
        continue
      }
      const [pen, total, ...rest] = row[0] as unknown[]
      const penalty = cstimerPenalty(pen)
      if (!penalty || !finite(total) || total < 0) {
        out.skipped++
        continue
      }
      const phaseEnds = rest.filter(finite).filter((t) => t > 0 && t < total).sort((a, b) => a - b)
      out.solves.push({
        sessionIndex,
        time: Math.round(total),
        penalty,
        scramble: typeof row[1] === 'string' ? row[1] : '',
        comment: typeof row[2] === 'string' && row[2] ? row[2] : undefined,
        date: finite(row[3]) ? row[3] * 1000 : Date.now(),
        event,
        splits: phaseEnds.length ? [...phaseEnds, total] : undefined,
        source: 'import',
      })
    }
  }
  return out
}

// the original name, kept so older backups still import
const BACKUP_APP = 'better-cstimer'

export interface Backup {
  app: typeof BACKUP_APP
  version: 1
  exported: number
  sessions: Session[]
  solves: Solve[]
}

export function makeBackup(sessions: Session[], solves: Solve[]): Backup {
  return { app: BACKUP_APP, version: 1, exported: Date.now(), sessions, solves }
}

const SOURCES: readonly InputSource[] = ['keyboard', 'touch', 'stackmat', 'smartcube', 'gantimer', 'typing', 'import']
const timedMoves = (v: unknown): TimedMove[] | undefined =>
  Array.isArray(v) && v.every((m) => isObj(m) && typeof m.m === 'string' && finite(m.t)) ? (v as TimedMove[]) : undefined

/** The fields of a stored solve, checked one by one; null when it has no usable time. Used for backups and for sync. */
export function solveFields(v: Record<string, unknown>): Omit<Solve, 'id' | 'sessionId' | 'uid' | 'updated'> | null {
  if (!finite(v.time) || !['ok', '+2', 'dnf'].includes(v.penalty as string)) return null
  return {
    time: v.time,
    penalty: v.penalty as Penalty,
    scramble: typeof v.scramble === 'string' ? v.scramble : '',
    event: typeof v.event === 'string' ? v.event : '333',
    date: finite(v.date) ? v.date : Date.now(),
    comment: typeof v.comment === 'string' ? v.comment : undefined,
    splits: Array.isArray(v.splits) && v.splits.every(finite) ? (v.splits as number[]) : undefined,
    moves: timedMoves(v.moves),
    rotations: timedMoves(v.rotations),
    source: SOURCES.includes(v.source as InputSource) ? (v.source as InputSource) : undefined,
    drill: DRILL_KINDS.includes(v.drill as DrillKind) ? (v.drill as DrillKind) : undefined,
  }
}

/** Parses our own backup file, validating each solve. */
function parseBackup(json: unknown): ImportedData {
  if (!isObj(json) || json.app !== BACKUP_APP || !Array.isArray(json.sessions) || !Array.isArray(json.solves))
    throw new Error('This file is not a Cadence backup.')
  const index = new Map<number, number>()
  const out: ImportedData = { sessions: [], solves: [], skipped: 0 }
  for (const s of json.sessions) {
    if (!isObj(s) || !finite(s.id) || typeof s.name !== 'string') continue
    index.set(s.id, out.sessions.length)
    out.sessions.push({ name: s.name, event: typeof s.event === 'string' ? s.event : '333', created: finite(s.created) ? s.created : Date.now(), order: out.sessions.length })
  }
  for (const v of json.solves) {
    const si = isObj(v) && finite(v.sessionId) ? index.get(v.sessionId) : undefined
    if (!isObj(v) || si == null) {
      out.skipped++
      continue
    }
    const fields = solveFields(v)
    if (fields) out.solves.push({ ...fields, sessionIndex: si, source: 'import' })
    else out.skipped++
  }
  return out
}

/** Detects the format and parses it. */
export function parseImport(text: string): ImportedData {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON.')
  }
  return isObj(json) && json.app === BACKUP_APP ? parseBackup(json) : parseCstimer(json)
}

/** cstimer-compatible export so data can go back the other way. */
export function toCstimer(sessions: Session[], solves: Solve[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const sessionData: Record<string, unknown> = {}
  sessions.forEach((s, i) => {
    const rows = solves
      .filter((v) => v.sessionId === s.id)
      .map((v) => [
        [v.penalty === 'dnf' ? -1 : v.penalty === '+2' ? 2000 : 0, v.time],
        v.scramble,
        v.comment ?? '',
        Math.floor(v.date / 1000),
      ])
    out[`session${i + 1}`] = rows
    sessionData[i + 1] = { name: s.name, opt: { scrType: TO_CSTIMER[s.event] ?? '333' }, rank: i + 1 }
  })
  out.properties = { sessionData: JSON.stringify(sessionData), sessionN: sessions.length }
  return out
}

const solveKey = (s: { date: number; time: number; scramble: string }) => `${s.date}|${s.time}|${s.scramble}`

/** Drops solves already stored here (same finish time, time and scramble) and sessions left empty, so importing a file twice adds nothing. */
export function withoutDuplicates(data: ImportedData, existing: readonly { date: number; time: number; scramble: string }[]): { data: ImportedData; duplicates: number } {
  const have = new Set(existing.map(solveKey))
  const fresh = data.solves.filter((s) => !have.has(solveKey(s)))
  const used = [...new Set(fresh.map((s) => s.sessionIndex))].sort((a, b) => a - b)
  const index = new Map(used.map((old, i) => [old, i]))
  return {
    data: {
      sessions: used.map((old, i) => ({ ...data.sessions[old], order: i })),
      solves: fresh.map((s) => ({ ...s, sessionIndex: index.get(s.sessionIndex)! })),
      skipped: data.skipped,
    },
    duplicates: data.solves.length - fresh.length,
  }
}
