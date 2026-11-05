import { DurableObject } from 'cloudflare:workers'
import { randomHex } from './auth'
import { PULL_LIMIT, type RecordKind, type SyncRecord, type SyncResponse } from './sync'
import type { WcaProfile } from './wca'

// a token unused for this long stops working; using one keeps it alive
const TOKEN_IDLE_MS = 180 * 24 * 60 * 60 * 1000
const TOKEN_TOUCH_MS = 60 * 60 * 1000
// far beyond any solver's lifetime of solves (a smart-cube solve is ~3 KB); stops one account filling the store
const MAX_ROWS = 500_000
const MAX_BYTES = 512 * 1024 * 1024
// a pull answers with about this much and says `more` for the rest
const PULL_BYTES = 4 * 1024 * 1024

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS records (
    kind TEXT NOT NULL, uid TEXT NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL,
    data TEXT, version INTEGER NOT NULL, PRIMARY KEY (kind, uid)
  );
  CREATE INDEX IF NOT EXISTS records_version ON records (version);
  CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, created INTEGER NOT NULL, used INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

// a type alias, not an interface, so it fits SqlStorage's row constraint
type RecordRow = {
  kind: string
  uid: string
  updated: number
  deleted: number
  data: string | null
  version: number
}

class StorageFull extends Error {}

/** Everything one WCA account has synced, in this object's own SQLite database. */
export class UserStore extends DurableObject<Env> {
  private readonly sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(SCHEMA)
  }

  private meta(key: string): string | null {
    const row = this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]
    return row?.value ?? null
  }

  private setMeta(key: string, value: string): void {
    this.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value)
  }

  private version(): number {
    return Number(this.meta('version') ?? 0)
  }

  createToken(profile: WcaProfile): string {
    const id = randomHex(16)
    const now = Date.now()
    this.sql.exec('INSERT INTO tokens (id, created, used) VALUES (?, ?, ?)', id, now, now)
    this.setMeta('profile', JSON.stringify(profile))
    return id
  }

  checkToken(id: string): boolean {
    const row = this.sql.exec<{ used: number }>('SELECT used FROM tokens WHERE id = ?', id).toArray()[0]
    if (!row) return false
    const now = Date.now()
    if (now - row.used > TOKEN_IDLE_MS) {
      this.revokeToken(id)
      return false
    }
    if (now - row.used > TOKEN_TOUCH_MS) this.sql.exec('UPDATE tokens SET used = ? WHERE id = ?', now, id)
    return true
  }

  revokeToken(id: string): void {
    this.sql.exec('DELETE FROM tokens WHERE id = ?', id)
  }

  profile(): WcaProfile | null {
    const raw = this.meta('profile')
    return raw ? (JSON.parse(raw) as WcaProfile) : null
  }

  /** Applies the device's changes (newest edit wins), then returns what changed after `since`. */
  sync(since: number, changes: SyncRecord[]): SyncResponse | { error: string } {
    try {
      this.applyChanges(changes)
    } catch (e) {
      if (e instanceof StorageFull) return { error: 'This account has reached its sync storage limit.' }
      throw e
    }
    return this.changesSince(since)
  }

  // throws StorageFull before any change lands, since the throw rolls the whole batch back
  private applyChanges(changes: SyncRecord[]): void {
    this.ctx.storage.transactionSync(() => {
      let version = this.version()
      let rows = Number(this.meta('rows') ?? 0)
      let bytes = Number(this.meta('bytes') ?? 0)
      for (const c of changes) {
        const row = this.sql.exec<{ updated: number; size: number }>('SELECT updated, length(data) AS size FROM records WHERE kind = ? AND uid = ?', c.kind, c.uid).toArray()[0]
        // equal means this edit is already stored; it comes back from devices that just pulled it
        if (row && row.updated >= c.updated) continue
        const data = c.deleted ? null : JSON.stringify(c.data ?? {})
        rows += row ? 0 : 1
        bytes += (data?.length ?? 0) - (row?.size ?? 0)
        if (rows > MAX_ROWS || bytes > MAX_BYTES) throw new StorageFull()
        version++
        this.sql.exec(
          'INSERT OR REPLACE INTO records (kind, uid, updated, deleted, data, version) VALUES (?, ?, ?, ?, ?, ?)',
          c.kind, c.uid, c.updated, c.deleted ? 1 : 0, data, version,
        )
      }
      this.setMeta('version', String(version))
      this.setMeta('rows', String(rows))
      this.setMeta('bytes', String(bytes))
    })
  }

  private changesSince(since: number): SyncResponse {
    const page: RecordRow[] = []
    let size = 0
    for (const r of this.sql.exec<RecordRow>('SELECT kind, uid, updated, deleted, data, version FROM records WHERE version > ? ORDER BY version LIMIT ?', since, PULL_LIMIT + 1)) {
      if (page.length === PULL_LIMIT || (page.length > 0 && size + (r.data?.length ?? 0) > PULL_BYTES)) break
      page.push(r)
      size += r.data?.length ?? 0
    }
    const more = page.length > 0 && this.sql.exec('SELECT 1 FROM records WHERE version > ? LIMIT 1', page[page.length - 1].version).toArray().length > 0
    return {
      version: more ? page[page.length - 1].version : this.version(),
      more,
      changes: page.map((r) => ({
        kind: r.kind as RecordKind,
        uid: r.uid,
        updated: r.updated,
        deleted: r.deleted === 1,
        data: r.data ? (JSON.parse(r.data) as Record<string, unknown>) : undefined,
      })),
    }
  }

  /** Erases the account's synced data and signs out every device. */
  async wipe(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.sql.exec(SCHEMA)
  }
}
