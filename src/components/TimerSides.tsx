import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { useEventSolves } from '../hooks/useSessionData'
import { eventById } from '../lib/events'
import { setSettings, useSettings } from '../lib/settings'
import { rollingAverage, sessionStats, type SessionStats } from '../lib/stats'
import { DNF, formatMs, formatSolve, solveValue } from '../lib/time'
import type { Session, Solve } from '../lib/types'
import { Segmented } from './Bits'

const RECENT = 10
const TREND = 50
const AVG_ROWS = [5, 12, 50, 100, 1000] as const

interface SidesProps {
  session: Session | undefined
  solves: Solve[]
  values: number[]
  stats: SessionStats
  decimals: 2 | 3
}

/** Recent times on the left, averages and a trend on the right; CSS shows them only where they clear the time. */
export function TimerSides({ session, solves, values, stats, decimals }: SidesProps) {
  const { sideScope } = useSettings()
  const event = session?.event ?? '333'
  const eventSolves = useEventSolves(event, sideScope === 'event')
  const eventValues = useMemo(() => eventSolves?.map(solveValue), [eventSolves])
  const eventStats = useMemo(() => eventValues && sessionStats(eventValues), [eventValues])
  if (!solves.length) return null
  // until every solve of the event has loaded, the session's numbers stand in
  const [shownValues, shown] = sideScope === 'event' && eventValues && eventStats ? [eventValues, eventStats] : [values, stats]
  return (
    <>
      <RecentList solves={solves} values={values} best={stats.best} />
      <aside className="side right chrome" aria-label="Averages">
        <Segmented
          id="side-scope"
          label="Scope"
          value={sideScope}
          onChange={(v) => setSettings({ sideScope: v })}
          options={[
            { value: 'session', label: session?.name ?? 'Session' },
            { value: 'event', label: `All ${eventById(event).short}` },
          ]}
        />
        <Trend values={values} />
        <table className="avgtable num">
          <thead>
            <tr><th /><th>current</th><th>best</th></tr>
          </thead>
          <tbody>
            <tr><th>mo3</th><td>{formatMs(shown.mo3, decimals)}</td><td /></tr>
            {AVG_ROWS.filter((n) => n <= 12 || shown.count >= n).map((n) => (
              <tr key={n}>
                <th>ao{n}</th>
                <td>{formatMs(shown.current[n], decimals)}</td>
                {/* red only when the current average is the best one */}
                <td className={shown.current[n] != null && shown.current[n] === shown.bestAvg[n] ? 'acc' : 'faded'}>{formatMs(shown.bestAvg[n], decimals)}</td>
              </tr>
            ))}
            <tr><th>single</th><td /><td className={shownValues[shownValues.length - 1] === shown.best ? 'acc' : 'faded'}>{formatMs(shown.best, decimals)}</td></tr>
          </tbody>
        </table>
        <div className="sidefoot">
          <span>mean <b className="num">{formatMs(shown.mean, decimals)}</b></span>
          <span>σ <b className="num">{formatMs(shown.sd, decimals)}</b></span>
          <span>worst <b className="num">{formatMs(shown.worst, decimals)}</b></span>
          {shown.dnf > 0 && <span>DNF <b className="num">{shown.dnf}</b></span>}
        </div>
      </aside>
    </>
  )
}

function RecentList({ solves, values, best }: { solves: Solve[]; values: number[]; best: number | null }) {
  const start = Math.max(0, solves.length - RECENT)
  const rows = solves.slice(start).map((s, k) => ({ s, i: start + k })).reverse()
  return (
    <aside className="side left chrome" aria-label="Recent solves">
      <h3>last {rows.length}</h3>
      <ol>
        <AnimatePresence initial={false}>
          {rows.map(({ s, i }) => (
            <motion.li key={s.id ?? i} layout="position" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <span className="idx">{i + 1}</span>
              <span className={`num ${values[i] === best ? 'acc' : ''}`}>{formatSolve(s)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </aside>
  )
}

const W = 220
const H = 64

/** Last 50 times as dots with the rolling ao5 drawn through them. DNFs sit on the top edge. */
function Trend({ values }: { values: number[] }) {
  const { dots, line } = useMemo(() => {
    const vals = values.slice(-TREND)
    const ao5 = rollingAverage(values, 5).slice(-TREND)
    const finite = vals.filter((v) => v !== DNF)
    if (finite.length < 2) return { dots: [], line: '' }
    const lo = Math.min(...finite)
    const hi = Math.max(...finite)
    const span = hi - lo || 1
    const x = (i: number) => (i / Math.max(1, vals.length - 1)) * (W - 6) + 3
    const y = (v: number) => (v === DNF ? 3 : 3 + (1 - (v - lo) / span) * (H - 6))
    let line = ''
    let pen = false
    ao5.forEach((v, i) => {
      if (v == null || v === DNF) return void (pen = false)
      line += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(Math.min(v, hi)).toFixed(1)}`
      pen = true
    })
    return { dots: vals.map((v, i) => ({ cx: x(i), cy: y(v), dnf: v === DNF })), line }
  }, [values])
  if (!dots.length) return null
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Last ${dots.length} solves with the rolling average of 5`}>
      {dots.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={1.8} className={d.dnf ? 'dnf' : ''} />)}
      {line && <path d={line} />}
    </svg>
  )
}
