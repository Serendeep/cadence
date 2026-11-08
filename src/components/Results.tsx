import { AnimatePresence, motion } from 'motion/react'
import { updateSolve } from '../lib/db'
import { removeSolveWithUndo } from '../lib/solveActions'
import type { SessionStats } from '../lib/stats'
import { DNF, formatMs, solveValue } from '../lib/time'
import type { Penalty, Solve } from '../lib/types'
import { AnimatedTime, PhaseBar } from './Bits'
import { TrashIcon } from './icons'

const PENALTIES: { value: Penalty; label: string }[] = [
  { value: 'ok', label: 'OK' },
  { value: '+2', label: '+2' },
  { value: 'dnf', label: 'DNF' },
]

/** How the last solve compares with the current ao12 (or ao5 early in a session). */
function Delta({ last, stats }: { last: Solve; stats: SessionStats }) {
  const ref = stats.current[12] ?? stats.current[5]
  const v = solveValue(last)
  if (ref == null || ref === DNF || v === DNF) return null
  const diff = v - ref
  const name = stats.current[12] != null ? 'ao12' : 'ao5'
  return (
    <span className="delta num">
      <span className={diff <= 0 ? 'good' : 'bad'}>{diff <= 0 ? '−' : '+'}{formatMs(Math.abs(diff))}</span> against your {name}
    </span>
  )
}

interface ResultsProps {
  solves: Solve[]
  stats: SessionStats
  decimals: 2 | 3
  /** Hide the per-solve controls, e.g. while the next solve is in progress */
  compact?: boolean
}

export function Results({ solves, stats, decimals, compact }: ResultsProps) {
  const last = solves[solves.length - 1]
  return (
    <div className="results">
      <AnimatePresence mode="wait">
        {last?.splits && last.splits.length > 1 && (
          <motion.div key={`ph${last.id}`} className="phasewrap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <PhaseBar splits={last.splits} method={last.method} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="statrow">
        <div className="stat">ao5<b><AnimatedTime value={stats.current[5]} decimals={decimals} /></b></div>
        <div className="stat">ao12<b><AnimatedTime value={stats.current[12]} decimals={decimals} /></b></div>
        <div className="stat">best<b><AnimatedTime value={stats.best} decimals={decimals} /></b></div>
        <div className="stat quiet">mean<b><AnimatedTime value={stats.mean} decimals={decimals} /></b></div>
        <div className="stat quiet count">solves<b className="num">{stats.count}</b></div>
      </div>
      {last && !compact && (
        <motion.div className="lastsolve" key={`ls${last.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <Delta last={last} stats={stats} />
          {PENALTIES.map((p) => (
            <button
              key={p.value}
              type="button"
              className="btn"
              aria-pressed={last.penalty === p.value}
              onClick={() => last.id != null && updateSolve(last.id, { penalty: p.value })}
            >
              {p.label}
            </button>
          ))}
          <button type="button" className="btn ghost iconbtn" aria-label="Delete last solve" onClick={() => removeSolveWithUndo(last)}>
            <TrashIcon />
          </button>
        </motion.div>
      )}
    </div>
  )
}
