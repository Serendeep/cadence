import { animate, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { phaseDurations, phaseNames, type Method } from '../lib/cfop'
import { DNF, formatMs } from '../lib/time'
import type { PhaseCount } from '../lib/smartSolve'

/** A time that rolls to its new value instead of jumping. DNF and empty values switch instantly. */
export function AnimatedTime({ value, decimals = 2 }: { value: number | null; decimals?: 2 | 3 }) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (value == null || from == null || value === DNF || from === DNF || from === value) {
      setShown(value)
      return
    }
    const ctl = animate(from, value, { duration: 0.55, ease: [0.2, 0.8, 0.2, 1], onUpdate: setShown })
    return () => ctl.stop()
  }, [value])
  if (shown == null) return <span className="nil" aria-label="not enough solves">—</span>
  return <>{formatMs(shown, decimals)}</>
}

const CFOP_COLORS = ['#f5f5f5', '#2fa84f', '#f4d23a', '#d8343a']
const GENERIC = ['var(--fg)', 'var(--acc)', 'var(--dim)', 'var(--faint)']


/** Solve split into phases; segments grow in one after another. */
export function PhaseBar({ splits, method, counts, animateIn = true }: { splits: readonly number[]; method?: Method; counts?: readonly PhaseCount[]; animateIn?: boolean }) {
  const d = phaseDurations(splits)
  const total = splits[splits.length - 1] || 1
  const names = phaseNames(d.length, method)
  const colors = d.length === 4 ? CFOP_COLORS : GENERIC
  return (
    <div>
      <div className="phasebar" role="img" aria-label={names.map((n, i) => `${n} ${formatMs(d[i])}`).join(', ')}>
        {d.map((v, i) => (
          <motion.i
            key={i}
            style={{ flex: Math.max(v, 1) / total, background: colors[i % colors.length] }}
            initial={animateIn ? { scaleX: 0, opacity: 0 } : false}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.08 * i, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
      </div>
      <div className="phaselabels">
        {d.map((v, i) => (
          <div key={i} style={{ flex: Math.max(v, 1) / total }}>
            {names[i]} <b className="num">{formatMs(v)}</b>
            {counts?.[i] && (
              <small>
                {counts[i].moves} {counts[i].moves === 1 ? 'move' : 'moves'}
                {counts[i].rotations > 0 && ` · ${counts[i].rotations} rot`}
              </small>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
}

/** Segmented control whose selection pill slides between options. */
export function Segmented<T extends string | number>({ value, options, onChange, label, id }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  id: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-bg" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
