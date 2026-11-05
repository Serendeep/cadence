export type RecordKind = 'session' | 'solve' | 'settings'

/** One synced row. `updated` is the editing device's clock; the newest edit wins. */
export interface SyncRecord {
  kind: RecordKind
  uid: string
  updated: number
  deleted: boolean
  data?: Record<string, unknown>
}

export interface SyncRequest {
  /** The server version this device has already pulled */
  since: number
  changes: SyncRecord[]
}

export interface SyncResponse {
  version: number
  /** True when more changes are waiting; ask again with the returned version */
  more: boolean
  changes: SyncRecord[]
}

export const MAX_SYNC_BODY = 8 * 1024 * 1024
export const MAX_CHANGES = 500
export const PULL_LIMIT = 500
// a long smart-cube solve with every move timed stays well under this
const MAX_RECORD_BYTES = 64 * 1024
const KINDS: readonly RecordKind[] = ['session', 'solve', 'settings']
const UID = /^[A-Za-z0-9-]{1,64}$/

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function parseRecord(v: unknown): SyncRecord | null {
  if (!isObj(v) || !KINDS.includes(v.kind as RecordKind) || typeof v.uid !== 'string' || !UID.test(v.uid)) return null
  if (typeof v.updated !== 'number' || !Number.isSafeInteger(v.updated) || v.updated < 0) return null
  const deleted = v.deleted === true
  if (!deleted && (!isObj(v.data) || JSON.stringify(v.data).length > MAX_RECORD_BYTES)) return null
  return { kind: v.kind as RecordKind, uid: v.uid, updated: v.updated, deleted, data: deleted ? undefined : (v.data as Record<string, unknown>) }
}

/** Validates a sync request body; null means reject the whole request. */
export function parseSyncRequest(body: unknown): SyncRequest | null {
  if (!isObj(body) || typeof body.since !== 'number' || !Number.isSafeInteger(body.since) || body.since < 0) return null
  if (!Array.isArray(body.changes) || body.changes.length > MAX_CHANGES) return null
  const changes: SyncRecord[] = []
  for (const c of body.changes) {
    const r = parseRecord(c)
    if (!r) return null
    changes.push(r)
  }
  return { since: body.since, changes }
}
