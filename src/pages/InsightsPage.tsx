import { useMemo, useState } from 'react'
import { PhaseBar, Segmented } from '../components/Bits'
import { CoachSection } from '../components/Coach'
import { phaseNames } from '../lib/cfop'
import { Heatmap, Histogram, LineChart } from '../components/Charts'
import { useEventSolves, useSessionData } from '../hooks/useSessionData'
import { eventById } from '../lib/events'
import { byDay, commonPhaseCount, pbHistory, phaseAverages, practiceGrid } from '../lib/insights'
import { useSettings } from '../lib/settings'
import { averageRecords, histogram, mean, median, rollingAverage, sessionStats, subX } from '../lib/stats'
import { DNF, formatMs, solveValue } from '../lib/time'
import type { Solve } from '../lib/types'

type Scope = 'session' | 'event'
const AVG_OPTIONS = [5, 12, 50, 100] as const
const NO_SOLVES: Solve[] = []

/** One sentence that states what changed, with its baseline named. */
/** How the latest block of solves compares with the block before it, or null with too few solves. */
function trend(values: number[]): { block: number; recent: number; diff: number } | null {
  const block = values.length >= 100 ? 50 : values.length >= 24 ? 12 : 0
  if (!block) return null
  const recent = mean(values.slice(-block))
  const before = mean(values.slice(-2 * block, -block))
  return recent != null && before != null ? { block, recent, diff: recent - before } : null
}

export function InsightsPage() {
  const { session, solves: sessionSolves } = useSessionData()
  const settings = useSettings()
  const [scope, setScope] = useState<Scope>('session')
  const [avgN, setAvgN] = useState<(typeof AVG_OPTIONS)[number]>(12)
  const event = session?.event ?? '333'
  const eventSolves = useEventSolves(event, scope === 'event' || settings.coach)
  const solves = scope === 'session' ? sessionSolves : eventSolves ?? NO_SOLVES
  const values = useMemo(() => solves.map(solveValue), [solves])
  const stats = useMemo(() => sessionStats(values), [values])
  const rolling = useMemo(() => rollingAverage(values, avgN), [values, avgN])
  const days = useMemo(() => byDay(solves).slice(-60), [solves])
  const pbs = useMemo(() => pbHistory(solves).slice(-8).reverse(), [solves])
  const phaseCount = useMemo(() => commonPhaseCount(solves), [solves])
  const phases = useMemo(() => (phaseCount ? phaseAverages(solves, phaseCount, settings.method) : null), [solves, phaseCount, settings.method])
  const grid = useMemo(() => practiceGrid(solves), [solves])
  const bins = useMemo(() => histogram(values), [values])
  const dec = settings.decimals


  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>Insights</h1>
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

      {stats.count === stats.dnf ? (
        <div className="emptystate">
          <h2>Nothing to analyse yet</h2>
          <p>Charts appear after a few finished solves.</p>
          <div className="row">
            <a className="btn primary" href="#/timer">Start timing</a>
            <a className="btn" href="#/settings?import">Import from csTimer</a>
          </div>
        </div>
      ) : (
        insightsBody()
      )}
    </div>
  )

  function insightsBody() {
    return (
      <>
      <Headline values={values} stats={stats} decimals={dec} />
      <StatsTables solves={solves} values={values} stats={stats} days={days.length} decimals={dec} />

      <section className="section">
        <div className="chart-head">
          <div>
            <h2>Progress</h2>
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
          <Histogram bins={bins} highlight={stats.current[12] !== DNF ? stats.current[12] : null} />
        </section>
        <section>
          <h2>Day by day</h2>
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
            <p className="sub">Averages over your last {phases.count} solves with splits.</p>
            <PhaseBar method={settings.method} splits={phases.means.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d], [])} />
            <div className="kpis" style={{ marginTop: 22 }}>
              {phases.means.map((m, i) => (
                <div className="kpi" key={i}>
                  {phaseNames(phaseCount, settings.method)[i]}
                  <b>{formatMs(m, dec)}</b>
                  <small>{((m / phases.means.reduce((a, b) => a + b, 0)) * 100).toFixed(0)}% of the solve</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty" style={{ marginTop: 12 }}>
            No splits yet. Connect a smart cube and it splits each solve into phases.
          </div>
        )}
      </section>

      <div className="grid2 section">
        <section>
          <h2>When you practise</h2>
          <Heatmap grid={grid} />
        </section>
        <section>
          <h2>Personal bests</h2>
          {pbs.length ? (
            <table className="solves-table pbtable">
              <tbody>
                {pbs.map((s, i) => {
                  const next = pbs[i + 1]
                  return (
                    <tr key={s.id} style={{ cursor: 'default' }}>
                      <td className="n t">{formatMs(solveValue(s), dec)}</td>
                      <td className="n dim">{next ? `−${formatMs(solveValue(next) - solveValue(s))}` : 'first'}</td>
                      <td className="n dim">{new Date(s.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
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
      {settings.coach && eventSolves && <CoachSection event={event} solves={eventSolves} />}
      </>
    )
  }
}

/** The one number that says where you are now, its trend, and the rest of the records in a quiet line. */
function Headline({ values, stats, decimals }: { values: number[]; stats: ReturnType<typeof sessionStats>; decimals: 2 | 3 }) {
  const lead = stats.current[12] != null ? { label: 'current ao12', v: stats.current[12] } : stats.current[5] != null ? { label: 'current ao5', v: stats.current[5] } : { label: 'best single', v: stats.best }
  const t = trend(values)
  return (
    <section className="headline">
      <div className="lead">
        <b className="num">{formatMs(lead.v, decimals)}</b>
        <p>
          {lead.label}
          {t && (
            <>
              <br />
              last {t.block} average <b className="num">{formatMs(t.recent, decimals)}</b>,{' '}
              <span className={t.diff <= 0 ? 'good' : 'bad'}>{formatMs(Math.abs(t.diff), decimals)} {t.diff <= 0 ? 'faster' : 'slower'}</span> than the {t.block} before
            </>
          )}
        </p>
      </div>
    </section>
  )
}

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** The numbers a cuber checks: every average with its best and when it was set, the session totals, and sub-X counts. */
function StatsTables({ solves, values, stats, days, decimals }: { solves: Solve[]; values: number[]; stats: ReturnType<typeof sessionStats>; days: number; decimals: 2 | 3 }) {
  const records = useMemo(() => averageRecords(values), [values])
  const mid = useMemo(() => median(values), [values])
  const sub = useMemo(() => subX(values), [values])
  const plus2 = useMemo(() => solves.filter((s) => s.penalty === '+2').length, [solves])
  const finished = stats.count - stats.dnf
  const session: [string, string][] = [
    ['solves', `${stats.count.toLocaleString()} over ${days} ${days === 1 ? 'day' : 'days'}`],
    ['mean', formatMs(stats.mean, decimals)],
    ['median', formatMs(mid, decimals)],
    ['σ', stats.sd != null && stats.mean ? `${formatMs(stats.sd, decimals)} · ${((stats.sd / stats.mean) * 100).toFixed(1)}%` : '—'],
    ['worst', formatMs(stats.worst, decimals)],
    ['+2 / DNF', `${plus2} / ${stats.dnf}`],
  ]
  return (
    <>
      <div className="stats-grid section">
        <section>
          <h2>Averages</h2>
          <table className="stats-table num">
            <thead><tr><th /><th>current</th><th>best</th><th>set</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.label}>
                  <th>{r.label}</th>
                  <td>{formatMs(r.current, decimals)}</td>
                  {/* red only when the current value is the best one */}
                  <td className={r.current != null && r.current === r.best ? 'pb' : ''}>{formatMs(r.best, decimals)}</td>
                  <td className="when">{r.bestAt != null && solves[r.bestAt] ? shortDate(solves[r.bestAt].date) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Session</h2>
          <table className="stats-table kv num">
            <tbody>
              {session.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody>
          </table>
        </section>
      </div>
      {sub.length > 0 && (
        <section className="section">
          <h2>Sub-X</h2>
          <div className="subx">
            {sub.map((x) => (
              <div key={x.under}>
                <span className="dim">sub-{formatMs(x.under).replace(/\.00$/, '')}</span>
                <b className="num">{x.count.toLocaleString()}</b>
                <i><b style={{ width: `${finished ? (x.count / finished) * 100 : 0}%` }} /></i>
                <small>{finished ? Math.round((x.count / finished) * 100) : 0}%</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
