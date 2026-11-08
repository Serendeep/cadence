import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import { PhaseBar } from './Bits'
import { CubeNet, Twisty } from './Cube'
import { BackIcon, CloseIcon } from './icons'
import { eventById } from '../lib/events'
import { updateSolve } from '../lib/db'
import { removeSolveWithUndo } from '../lib/solveActions'
import { scrambledState } from '../lib/smartSolve'
import { solverFrame, timeline } from '../lib/rotations'
import { formatDate, formatMs, formatSolve } from '../lib/time'
import type { Penalty, Solve } from '../lib/types'

interface DrawerProps {
  solve: Solve
  index: number
  onClose: () => void
  decimals: 2 | 3
  /** Undefined at the ends of the list. The list shows newest first, so ← is newer and → is older. */
  onNewer?: () => void
  onOlder?: () => void
}

export function SolveDrawer({ solve, index, onClose, decimals, onNewer, onOlder }: DrawerProps) {
  const box = useModalFocus<HTMLElement>()
  const [replayFor, setReplayFor] = useState<number | null>(null)
  const replay = replayFor != null && replayFor === solve.id
  const ev = eventById(solve.event)
  const preview = useMemo(() => (ev.is3x3 ? scrambledState(solve.scramble) : null), [ev.is3x3, solve.scramble])
  const recon = useMemo(() => solverFrame(timeline(solve.moves, solve.rotations)), [solve.moves, solve.rotations])
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
        ref={box}
        tabIndex={-1}
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
            <PhaseBar splits={solve.splits} method={solve.method} />
          </div>
        )}

        <h3 style={{ fontSize: 14, margin: '28px 0 6px' }}>Scramble</h3>
        <p className="mono" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{solve.scramble || '—'}</p>
        {preview && <div style={{ marginTop: 12 }}><CubeNet state={preview} size={12} /></div>}

        {solve.moves && solve.moves.length > 0 && (
          <>
            <h3 style={{ fontSize: 14, margin: '28px 0 6px' }}>
              Reconstruction · {solve.moves.length} moves · {(solve.moves.length / (solve.time / 1000)).toFixed(2)} tps
              {solve.rotations?.length ? ` · ${solve.rotations.length} rotation${solve.rotations.length === 1 ? '' : 's'}` : ''}
            </h3>
            <p className="mono dim recon" style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
              {recon.map((item, i) => (
                <span key={i} className={item.rotation ? 'rot' : undefined}>{i ? ' ' : ''}{item.rotation ? `(${item.m})` : item.m}</span>
              ))}
            </p>
            {replay ? (
              <div className="replay">
                <Twisty event="333" visualization="3D" controls setup={solve.scramble} alg={recon.map((m) => m.m).join(' ')} label="Solve replay" />
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
