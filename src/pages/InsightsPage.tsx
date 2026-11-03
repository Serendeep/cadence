import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { PhaseBar, phaseNames, Segmented } from '../components/Bits'
import { Heatmap, Histogram, LineChart } from '../components/Charts'
import { useSessionData } from '../hooks/useSessionData'
import { db } from '../lib/db'
import { eventById } from '../lib/events'
import { byDay, commonPhaseCount, pbHistory, phaseAverages, practiceGrid } from '../lib/insights'
import { useSettings } from '../lib/settings'
import { histogram, mean, rollingAverage, sessionStats } from '../lib/stats'
import { DNF, formatMs, solveValue } from '../lib/time'
import type { Solve } from '../lib/types'

type Scope = 'session' | 'event'
const AVG_OPTIONS = [5, 12, 50, 100] as const
const NO_SOLVES: Solve[] = []

/** One sentence that states what changed, with its baseline named. */
function finding(values: number[], stats: ReturnType<typeof sessionStats>): string {
  if (!values.length) return 'Do a few solves and your analysis appears here.'
  const block = values.length >= 100 ? 50 : values.length >= 24 ? 12 : 0
  if (block) {
    const recent = mean(values.slice(-block))
    const before = mean(values.slice(-2 * block, -block))
    if (recent != null && before != null) {
      const d = recent - before
      return `Your last ${block} solves average ${formatMs(recent)}, ${formatMs(Math.abs(d))} ${d <= 0 ? 'faster' : 'slower'} than the ${block} before.`
    }
  }
  return `${values.length} solves so far, best single ${formatMs(stats.best)}.`
}

export function InsightsPage() {
  const { session, solves: sessionSolves } = useSessionData()
  const settings = useSettings()
  const [scope, setScope] = useState<Scope>('session')
  const [avgN, setAvgN] = useState<(typeof AVG_OPTIONS)[number]>(12)
  const event = session?.event ?? '333'
  const eventSolves = useLiveQuery(
    () => (scope === 'event' ? db.solves.orderBy('date').filter((s) => s.event === event).toArray() : Promise.resolve([] as Solve[])),
    [scope, event],
  )
  const solves = scope === 'session' ? sessionSolves : eventSolves ?? NO_SOLVES
  const values = useMemo(() => solves.map(solveValue), [solves])
  const stats = useMemo(() => sessionStats(values), [values])
  const rolling = useMemo(() => rollingAverage(values, avgN), [values, avgN])
  const days = useMemo(() => byDay(solves).slice(-60), [solves])
  const pbs = useMemo(() => pbHistory(solves).slice(-8).reverse(), [solves])
  const phaseCount = useMemo(() => commonPhaseCount(solves), [solves])
  const phases = useMemo(() => (phaseCount ? phaseAverages(solves, phaseCount) : null), [solves, phaseCount])
  const grid = useMemo(() => practiceGrid(solves), [solves])
  const bins = useMemo(() => histogram(values), [values])
  const dec = settings.decimals

  const kpis: [string, number | null, string?][] = [
    ['Best single', stats.best],
    ['Best ao5', stats.bestAvg[5]],
    ['Best ao12', stats.bestAvg[12]],
    ['Best ao100', stats.bestAvg[100]],
    ['Mean', stats.mean, `${stats.dnf} DNF`],
    ['Std. deviation', stats.sd, stats.sd && stats.mean ? `${((stats.sd / stats.mean) * 100).toFixed(1)}% of mean` : undefined],
  ]

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Insights</h1>
          <p>{finding(values, stats)}</p>
        </div>
        <div className="actions">
          <Segmented
            id="scope"
            label="Scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'session', label: session?.name ?? 'Session' },
              { value: 'event', label: `All ${eventById(event).short}` },
            ]}
          />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          Solves<b className="num">{stats.count.toLocaleString()}</b>
          <small>{days.length} days practised</small>
        </div>
        {kpis.map(([label, v, sub], i) => (
          <div key={label} className={`kpi ${i === 0 ? 'lead' : ''}`}>
            {label}
            <b>{formatMs(v, dec)}</b>
            {sub && <small>{sub}</small>}
          </div>
        ))}
      </div>

      <section className="section">
        <div className="chart-head">
          <div>
            <h2>Progress</h2>
            <p className="sub dim" style={{ margin: 0, fontSize: 14 }}>Every single, with your rolling average over it.</p>
          </div>
          <Segmented id="avg" label="Rolling average" value={avgN} onChange={setAvgN} options={AVG_OPTIONS.map((n) => ({ value: n, label: `ao${n}` }))} />
        </div>
        <div className="legend" style={{ marginBottom: 8 }}>
          <span><i style={{ background: 'var(--faint)' }} />single</span>
          <span><i style={{ background: 'var(--acc)' }} />ao{avgN}</span>
        </div>
        <LineChart
          series={[
            { name: 'single', values, color: 'var(--faint)', dots: true },
            { name: `ao${avgN}`, values: rolling, color: 'var(--acc)', width: 2.5 },
          ]}
          xLabel={(i) => `#${i + 1}`}
          height={260}
        />
      </section>

      <div className="grid2 section">
        <section>
          <h2>Where your times land</h2>
          <p className="sub dim" style={{ margin: '2px 0 14px', fontSize: 14 }}>Solve count per time bucket; the highlighted bar holds your current ao12.</p>
          <Histogram bins={bins} highlight={stats.current[12] !== DNF ? stats.current[12] : null} />
        </section>
        <section>
          <h2>Day by day</h2>
          <p className="sub dim" style={{ margin: '2px 0 14px', fontSize: 14 }}>Daily mean and best over your last {days.length} practice days.</p>
          <div className="legend" style={{ marginBottom: 8 }}>
            <span><i style={{ background: 'var(--acc)' }} />daily mean</span>
            <span><i style={{ background: 'var(--dim)' }} />daily best</span>
          </div>
          <LineChart
            series={[
              { name: 'mean', values: days.map((d) => d.mean), color: 'var(--acc)' },
              { name: 'best', values: days.map((d) => d.best), color: 'var(--dim)', width: 1.5 },
            ]}
            xLabel={(i) => new Date(days[i]?.start ?? 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            height={200}
          />
        </section>
      </div>

      <section className="section">
        <h2>Phases</h2>
        {phases && phaseCount ? (
          <>
            <p className="sub">Average of each phase over your last {phases.count} solves with splits.</p>
            <PhaseBar splits={phases.means.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d], [])} />
            <div className="kpis" style={{ marginTop: 22 }}>
              {phases.means.map((m, i) => (
                <div className="kpi" key={i}>
                  {phaseNames(phaseCount)[i]}
                  <b>{formatMs(m, dec)}</b>
                  <small>{((m / phases.means.reduce((a, b) => a + b, 0)) * 100).toFixed(0)}% of the solve</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty" style={{ marginTop: 12 }}>
            No phase splits yet. Turn on phases in the timer bar (tap space at the end of each phase), or connect a smart cube for automatic CFOP splits.
          </div>
        )}
      </section>

      <div className="grid2 section">
        <section>
          <h2>When you practise</h2>
          <p className="sub dim" style={{ margin: '2px 0 14px', fontSize: 14 }}>Solves by weekday and hour of day.</p>
          <Heatmap grid={grid} />
        </section>
        <section>
          <h2>Personal bests</h2>
          <p className="sub dim" style={{ margin: '2px 0 14px', fontSize: 14 }}>Each solve that set a new best single, latest first.</p>
          {pbs.length ? (
            <table className="solves-table">
              <tbody>
                {pbs.map((s, i) => {
                  const next = pbs[i + 1]
                  return (
                    <tr key={s.id} style={{ cursor: 'default' }}>
                      <td className="n t">{formatMs(solveValue(s), dec)}</td>
                      <td className="n dim">{next ? `−${formatMs(solveValue(next) - solveValue(s))}` : 'first'}</td>
                      <td className="n dim">{new Date(s.date).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">Your first finished solve becomes your first PB.</div>
          )}
        </section>
      </div>
    </div>
  )
}
