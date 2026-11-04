import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PhaseBar, phaseNames } from '../components/Bits'
import { CubeNet, Twisty } from '../components/Cube'
import { Menu } from '../components/Menu'
import { removeSolveWithUndo } from '../components/Results'
import { BackIcon, CloseIcon } from '../components/icons'
import { useSessionData } from '../hooks/useSessionData'
import { phaseDurations } from '../lib/cfop'
import { createSession, deleteSession, updateSession, updateSolve } from '../lib/db'
import { eventById } from '../lib/events'
import { setSettings, useSettings } from '../lib/settings'
import { scrambledState } from '../lib/smartSolve'
import { rollingAverage } from '../lib/stats'
import { formatDate, formatMs, formatSolve } from '../lib/time'
import type { Penalty, Solve } from '../lib/types'

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
  s.splits && s.splits.length > 1 ? phaseDurations(s.splits).map((d, i) => `${phaseNames(s.splits!.length)[i]} ${formatMs(d)}`).join(' · ') : undefined

export function SolvesPage() {
  const { sessions, session, solves, values, stats } = useSessionData()
  const settings = useSettings()
  const [shown, setShown] = useState(PAGE)
  const [openId, setOpenId] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ao5 = useMemo(() => rollingAverage(values, 5), [values])
  const ao12 = useMemo(() => rollingAverage(values, 12), [values])
  const rows = useMemo(() => solves.map((s, i) => ({ s, i })).reverse().slice(0, shown), [solves, shown])
  const hasComments = rows.some(({ s }) => s.comment)
  const openIndex = solves.findIndex((s) => s.id === openId)
  const open = openIndex >= 0 ? solves[openIndex] : null
  const step = useCallback((delta: number) => setOpenId((id) => solves[solves.findIndex((s) => s.id === id) + delta]?.id ?? id), [solves])
  const dec = settings.decimals

  useEffect(() => setShown(PAGE), [session?.id])
  const importCs = () => (location.hash = '/settings?import')
  const newSession = () => void createSession(`Session ${sessions.length + 1}`, session?.event ?? '333').then((id) => setSettings({ sessionId: id }))

  return (
    <div className="page">
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
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="wide-only">
            <button type="button" className="btn" onClick={importCs}>Import from csTimer</button>
            <button type="button" className="btn" onClick={() => setRenaming(true)}>Rename</button>
            <button type="button" className="btn" onClick={newSession}>New session</button>
            <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)} disabled={sessions.length <= 1}>
              Delete session
            </button>
          </div>
          <Menu
            className="narrow-only"
            label="Session actions"
            trigger={<span className="btn">More</span>}
            items={[
              { key: 'import', label: 'Import from csTimer', onSelect: importCs },
              { key: 'rename', label: 'Rename session', onSelect: () => setRenaming(true) },
              { key: 'new', label: 'New session', onSelect: newSession },
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
          <table className={`solves-table ${hasComments ? '' : 'compact'}`}>
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
              <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>Show {PAGE} more</button>
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

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-46%' }}
        animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
        exit={{ opacity: 0, scale: 0.97, x: '-50%', y: '-48%' }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <h2>{title}</h2>
        {children}
      </motion.div>
    </>
  )
}

interface DrawerProps {
  solve: Solve
  index: number
  onClose: () => void
  decimals: 2 | 3
  /** Undefined at the ends of the list. The list shows newest first, so ← is newer and → is older. */
  onNewer?: () => void
  onOlder?: () => void
}

function SolveDrawer({ solve, index, onClose, decimals, onNewer, onOlder }: DrawerProps) {
  const [replayFor, setReplayFor] = useState<number | null>(null)
  const replay = replayFor != null && replayFor === solve.id
  const ev = eventById(solve.event)
  const preview = useMemo(() => (ev.is3x3 ? scrambledState(solve.scramble) : null), [ev.is3x3, solve.scramble])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if ((e.target as HTMLElement | null)?.closest?.('textarea, input')) return
      if (e.key === 'ArrowLeft') onNewer?.()
      if (e.key === 'ArrowRight') onOlder?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNewer, onOlder])

  const setPenalty = (penalty: Penalty) => solve.id != null && updateSolve(solve.id, { penalty })

  return (
    <>
      <motion.div className="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Solve ${index + 1}`}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2>Solve {index + 1}</h2>
            <div className="dim" style={{ fontSize: 14 }}>{formatDate(solve.date)} · {ev.name}{solve.source ? ` · ${solve.source}` : ''}</div>
          </div>
          <div className="drawer-nav">
            <button type="button" className="btn ghost iconbtn" aria-label="Newer solve" title="Newer solve (←)" disabled={!onNewer} onClick={onNewer}><BackIcon /></button>
            <button type="button" className="btn ghost iconbtn flip" aria-label="Older solve" title="Older solve (→)" disabled={!onOlder} onClick={onOlder}><BackIcon /></button>
            <button type="button" className="btn ghost iconbtn" aria-label="Close" onClick={onClose}><CloseIcon /></button>
          </div>
        </div>
        <div style={{ fontSize: 64, fontWeight: 500, letterSpacing: '-0.04em', margin: '18px 0 10px' }} className="num">
          {formatSolve(solve)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ok', '+2', 'dnf'] as const).map((p) => (
            <button key={p} type="button" className="btn" aria-pressed={solve.penalty === p} onClick={() => setPenalty(p)}>
              {p === 'ok' ? 'OK' : p.toUpperCase()}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              removeSolveWithUndo(solve)
              onClose()
            }}
          >
            Delete
          </button>
        </div>

        {solve.splits && solve.splits.length > 1 && (
          <div style={{ marginTop: 26 }}>
            <PhaseBar splits={solve.splits} />
          </div>
        )}

        <h3 style={{ fontSize: 14, margin: '28px 0 6px' }}>Scramble</h3>
        <p className="mono" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{solve.scramble || '—'}</p>
        {preview && <div style={{ marginTop: 12 }}><CubeNet state={preview} size={12} /></div>}

        {solve.moves && solve.moves.length > 0 && (
          <>
            <h3 style={{ fontSize: 14, margin: '28px 0 6px' }}>
              Reconstruction · {solve.moves.length} moves · {(solve.moves.length / (solve.time / 1000)).toFixed(2)} tps
            </h3>
            <p className="mono dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{solve.moves.map((m) => m.m).join(' ')}</p>
            {replay ? (
              <div style={{ height: 300, marginTop: 12 }}>
                <Twisty event="333" visualization="3D" controls setup={solve.scramble} alg={solve.moves.map((m) => m.m).join(' ')} label="Solve replay" />
              </div>
            ) : (
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setReplayFor(solve.id ?? null)}>Replay in 3D</button>
            )}
          </>
        )}

        <h3 style={{ fontSize: 14, margin: '28px 0 6px' }}>
          <label htmlFor="comment">Comment</label>
        </h3>
        <textarea
          id="comment"
          key={solve.id}
          defaultValue={solve.comment ?? ''}
          maxLength={500}
          placeholder="Add a note about this solve"
          onBlur={(e) => solve.id != null && updateSolve(solve.id, { comment: e.currentTarget.value.trim() || undefined })}
        />
        <p className="dim" style={{ fontSize: 12 }}>Raw time {formatMs(solve.time, decimals)}. Saved when you leave the field.</p>
      </motion.aside>
    </>
  )
}
