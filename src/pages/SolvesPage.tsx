import { Dialog } from '../components/Dialog'
import { SolveDrawer } from '../components/SolveDrawer'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useMemo, useState } from 'react'
import { phaseNames } from '../lib/cfop'
import { Menu } from '../components/Menu'
import { useSessionCounts, useSessionData } from '../hooks/useSessionData'
import { phaseDurations } from '../lib/cfop'
import { createSession, deleteSession, mergeSession, updateSession } from '../lib/db'
import { eventById } from '../lib/events'
import { setSettings, useSettings } from '../lib/settings'
import { rollingAverage } from '../lib/stats'
import { formatMs, formatSolve } from '../lib/time'
import { toast } from '../lib/toast'
import type { Solve } from '../lib/types'

const PAGE = 100

const dayKey = (t: number) => new Date(t).toDateString()

/** "Today", "Yesterday", "2 Nov", or "2 Nov 2025" outside the current year. */
function dayLabel(t: number, now = Date.now()): string {
  const key = dayKey(t)
  if (key === dayKey(now)) return 'Today'
  if (key === dayKey(now - 86400000)) return 'Yesterday'
  const d = new Date(t)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() && { year: 'numeric' }) })
}

const splitsTitle = (s: Solve) =>
  s.splits && s.splits.length > 1 ? phaseDurations(s.splits).map((d, i) => `${phaseNames(s.splits!.length, s.method)[i]} ${formatMs(d)}`).join(' · ') : undefined

export function SolvesPage() {
  const { sessions, session, solves, values, stats } = useSessionData()
  const settings = useSettings()
  // how many rows to show, remembered per session so switching sessions starts again at one page
  const [paging, setPaging] = useState({ session: session?.id, shown: PAGE })
  const shown = paging.session === session?.id ? paging.shown : PAGE
  const [openId, setOpenId] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<number | null>(null)
  const counts = useSessionCounts()
  const ao5 = useMemo(() => rollingAverage(values, 5), [values])
  const ao12 = useMemo(() => rollingAverage(values, 12), [values])
  const rows = useMemo(() => solves.map((s, i) => ({ s, i })).reverse().slice(0, shown), [solves, shown])
  const hasComments = rows.some(({ s }) => s.comment)
  const openIndex = solves.findIndex((s) => s.id === openId)
  const open = openIndex >= 0 ? solves[openIndex] : null
  const step = useCallback((delta: number) => setOpenId((id) => solves[solves.findIndex((s) => s.id === id) + delta]?.id ?? id), [solves])
  const dec = settings.decimals

  const importCs = () => (location.hash = '/settings?import')
  const mergeCandidates = sessions.filter((s) => s.id !== session?.id && s.event === session?.event)
  const target = sessions.find((s) => s.id === mergeTarget)
  const moreItems = [
    session?.archived
      ? { key: 'unarchive', label: 'Unarchive', onSelect: () => void updateSession(session.id!, { archived: false }) }
      : { key: 'archive', label: 'Archive', onSelect: () => session?.id != null && void updateSession(session.id, { archived: true }) },
    ...(mergeCandidates.length ? [{ key: 'merge', label: 'Merge into…', onSelect: () => setMergeTarget(mergeCandidates[0].id!) }] : []),
  ]
  const merge = () => {
    setMergeTarget(null)
    if (session?.id == null || target?.id == null) return
    mergeSession(session.id, target.id)
      .then(() => setSettings({ sessionId: target.id! }))
      .catch((e: unknown) => toast(`Could not merge: ${e instanceof Error ? e.message : 'unknown error'}`))
  }
  const newSession = () => void createSession(`Session ${sessions.length + 1}`, session?.event ?? '333').then((id) => setSettings({ sessionId: id }))

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="pagehead">
        <div>
          {renaming && session?.id != null ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const name = new FormData(e.currentTarget).get('name')?.toString().trim()
                if (name) void updateSession(session.id!, { name })
                setRenaming(false)
              }}
            >
              <label className="visually-hidden" htmlFor="sess-name">Session name</label>
              <input id="sess-name" name="name" type="text" defaultValue={session.name} autoFocus onBlur={(e) => e.currentTarget.form?.requestSubmit()} maxLength={40} />
            </form>
          ) : (
            <h1>{session?.name ?? 'Solves'}</h1>
          )}
          <p>
            {eventById(session?.event ?? '333').name} · {stats.count.toLocaleString()} solves · mean {formatMs(stats.mean, dec)} · best {formatMs(stats.best, dec)}
          </p>
        </div>
        <div className="actions">
          <select aria-label="Session" value={session?.id ?? ''} onChange={(e) => setSettings({ sessionId: Number(e.target.value) })}>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.archived ? `${s.name} (archived)` : s.name}</option>
            ))}
          </select>
          <div className="wide-only">
            <button type="button" className="btn" onClick={importCs}>Import from csTimer</button>
            <button type="button" className="btn text" onClick={() => setRenaming(true)}>Rename</button>
            <button type="button" className="btn text" onClick={newSession}>New session</button>
            <button type="button" className="btn text danger" onClick={() => setConfirmDelete(true)} disabled={sessions.length <= 1}>
              Delete session
            </button>
            <Menu label="More session actions" trigger={<span className="btn text">More</span>} items={moreItems} />
          </div>
          <Menu
            className="narrow-only"
            label="Session actions"
            trigger={<span className="btn">More</span>}
            items={[
              { key: 'import', label: 'Import from csTimer', onSelect: importCs },
              { key: 'rename', label: 'Rename session', onSelect: () => setRenaming(true) },
              { key: 'new', label: 'New session', onSelect: newSession },
              ...moreItems,
              ...(sessions.length > 1 ? ['sep' as const, { key: 'delete', label: 'Delete session', onSelect: () => setConfirmDelete(true) }] : []),
            ]}
          />
        </div>
      </div>

      {solves.length === 0 ? (
        <div className="empty">
          No solves in this session yet. They appear here as you time them, or{' '}
          <button type="button" className="textbtn" style={{ color: 'var(--acc)' }} onClick={() => (location.hash = '/settings?import')}>
            import your csTimer history
          </button>
          .
        </div>
      ) : (
        <>
          <table className="solves-table">
            <thead>
              <tr>
                <th className="n" style={{ width: 64 }}>#</th>
                <th className="n">Time</th>
                <th className="n">ao5</th>
                <th className="n hide-sm">ao12</th>
                {hasComments && <th className="hide-sm" style={{ paddingLeft: 32 }}>Comment</th>}
                <th className="n hide-sm">Time of day</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.flatMap(({ s, i }, k) => [
                  ...(k === 0 || dayKey(rows[k - 1].s.date) !== dayKey(s.date)
                    ? [
                        <motion.tr key={`day-${dayKey(s.date)}`} className="dayrow" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <td colSpan={hasComments ? 6 : 5}>{dayLabel(s.date)}</td>
                        </motion.tr>,
                      ]
                    : []),
                  <motion.tr
                    key={s.id}
                    layout="position"
                    initial={{ opacity: 0, backgroundColor: 'var(--surface)' }}
                    animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }}
                    exit={{ opacity: 0 }}
                    onClick={() => setOpenId(s.id ?? null)}
                    tabIndex={0}
                    title={splitsTitle(s)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenId(s.id ?? null)}
                  >
                    <td className="n dim">{i + 1}</td>
                    <td className={`n t ${values[i] === stats.best ? 'best' : ''}`}>{formatSolve(s)}</td>
                    <td className="n">{formatMs(ao5[i], dec)}</td>
                    <td className="n hide-sm">{formatMs(ao12[i], dec)}</td>
                    {hasComments && <td className="comment hide-sm" style={{ paddingLeft: 32 }}>{s.comment ?? ''}</td>}
                    <td className="n dim hide-sm">{new Date(s.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</td>
                  </motion.tr>,
                ])}
              </AnimatePresence>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 16 }}>
            <span className="dim num" style={{ fontSize: 14 }}>
              1–{Math.min(shown, solves.length).toLocaleString()} of {solves.length.toLocaleString()}
            </span>
            {shown < solves.length && (
              <button type="button" className="btn" onClick={() => setPaging({ session: session?.id, shown: shown + PAGE })}>Show {PAGE} more</button>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {open && (
          <SolveDrawer
            key="drawer"
            solve={open}
            index={openIndex}
            onClose={() => setOpenId(null)}
            decimals={dec}
            onNewer={openIndex < solves.length - 1 ? () => step(1) : undefined}
            onOlder={openIndex > 0 ? () => step(-1) : undefined}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {target && session && (
          <Dialog title="Merge sessions" onClose={() => setMergeTarget(null)}>
            <label className="visually-hidden" htmlFor="merge-target">Merge into</label>
            <select id="merge-target" value={target.id} onChange={(e) => setMergeTarget(Number(e.target.value))}>
              {mergeCandidates.map((s) => (
                <option key={s.id} value={s.id}>{s.name} · {(counts.get(s.id!) ?? 0).toLocaleString()}</option>
              ))}
            </select>
            <p className="dim">
              Move {solves.length.toLocaleString()} solves from {session.name} into {target.name}? {session.name} is then deleted.
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setMergeTarget(null)}>Cancel</button>
              <button type="button" className="btn primary" onClick={merge}>Merge</button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmDelete && session && (
          <Dialog title={`Delete "${session.name}"?`} onClose={() => setConfirmDelete(false)}>
            <p className="dim">This removes the session and its {stats.count.toLocaleString()} solves. Export a backup first if you might want them back.</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirmDelete(false)
                  if (session.id != null) void deleteSession(session.id).then(() => setSettings({ sessionId: null }))
                }}
              >
                Delete {stats.count.toLocaleString()} solves
              </button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  )
}
