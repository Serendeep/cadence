import { useEffect, useMemo, useState } from 'react'
import { useEventSolves } from '../hooks/useSessionData'
import { DRILLS, findings, lastSitting, measure, SITTING_GAP_MS, type Finding, type FindingKind, type SittingSummary } from '../lib/coach'
import { CFOP_PHASES } from '../lib/cfop'
import { setSettings, useSettings, type CoachFocus } from '../lib/settings'
import { formatMs } from '../lib/time'
import type { Solve } from '../lib/types'

const SEEN_KEY = 'cadence:coach-seen'
const TICK_MS = 60_000
const NAMES = { consistency: 'Slow solves', warmup: 'Warm-up', fatigue: 'Late-sitting slowdown' } as const

const focusName = (f: CoachFocus) => (f.kind.startsWith('phase-') ? CFOP_PHASES[Number(f.kind.slice(6))] : NAMES[f.kind as keyof typeof NAMES])

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

interface Progress {
  count: number
  now: number | null
}

/** Before and after for the finding being worked on. */
function useProgress(focus: CoachFocus | null, solves: readonly Solve[]): Progress | null {
  return useMemo(() => {
    if (!focus) return null
    const since = solves.filter((s) => s.date >= focus.since)
    return { count: since.length, now: measure(focus.kind, since) }
  }, [focus, solves])
}

function ProgressLine({ focus, progress }: { focus: CoachFocus; progress: Progress }) {
  const { now, count } = progress
  if (now == null) {
    return (
      <p className="coach-progress">
        {focusName(focus)} was <b className="num">{formatMs(focus.baseline)} s</b> when you started on {shortDate(focus.since)}. {count} {count === 1 ? 'solve' : 'solves'} since; a few more and Coach shows the change.
      </p>
    )
  }
  return (
    <p className="coach-progress">
      {focusName(focus)}: <b className="num">{formatMs(focus.baseline)}</b> → <b className={`num ${now <= focus.baseline ? 'good' : 'bad'}`}>{formatMs(now)} s</b> over {count} solves since {shortDate(focus.since)}.
    </p>
  )
}

function DrillCard({ kind, onStart }: { kind: FindingKind; onStart?: () => void }) {
  const drill = DRILLS[kind]
  return (
    <div className="coach-drill">
      <h3>{drill.title} <span className="dim">· {drill.minutes} min</span></h3>
      <ol>
        {drill.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {onStart && <button type="button" className="btn primary" onClick={onStart}>Work on this</button>}
    </div>
  )
}

/** Coach in Insights: the biggest finding, its drill, and before/after for what the solver is working on. */
export function CoachSection({ event, solves }: { event: string; solves: readonly Solve[] }) {
  const { coachFocus } = useSettings()
  const list = useMemo(() => findings(solves), [solves])
  const focus = coachFocus?.event === event ? coachFocus : null
  const progress = useProgress(focus, solves)
  const [top, ...others] = list
  const start = (f: Finding) => setSettings({ coachFocus: { kind: f.kind, event, since: Date.now(), baseline: f.metric } })
  const rest = focus ? list.filter((f) => f.kind !== focus.kind) : others

  return (
    <section className="section coach" id="coach">
      <h2>Coach</h2>
      {focus && progress ? (
        <>
          <div className="coach-focus">
            <ProgressLine focus={focus} progress={progress} />
            <button type="button" className="btn" onClick={() => setSettings({ coachFocus: null })}>Done with this</button>
          </div>
          <DrillCard kind={focus.kind} />
        </>
      ) : top ? (
        <>
          <p className="coach-headline">{top.title}</p>
          <p className="sub">{top.detail}</p>
          <DrillCard kind={top.kind} onStart={() => start(top)} />
        </>
      ) : (
        <p className="sub">
          Nothing stands out yet. Coach checks your last 50 solves for slow outliers once you have 25, compares phases once you have 60 solves with CFOP splits,
          and looks at warm-up and fatigue after three sittings of 10 or more solves.
        </p>
      )}
      {rest.length > 0 && (
        <details className="coach-more">
          <summary>{rest.length} {focus ? 'other' : 'more'} {rest.length === 1 ? 'finding' : 'findings'}</summary>
          <ul>
            {rest.map((f) => (
              <li key={f.kind}><b>{f.title}.</b> {f.detail}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0)
  } catch {
    return 0
  }
}

function writeSeen(end: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(end))
  } catch {
    // storage blocked: the card shows again next visit, which is harmless
  }
}

/** After a break, sums up the sitting that just ended. `solves` is the live session, so the next solve hides it. */
export function CoachCard({ solves, event, decimals }: { solves: readonly Solve[]; event: string; decimals: 2 | 3 }) {
  const [now, setNow] = useState(() => Date.now())
  const [seen, setSeen] = useState(readSeen)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  const sitting = useMemo(() => lastSitting(solves, now), [solves, now])
  if (!sitting || sitting.end <= seen || now - sitting.end < SITTING_GAP_MS) return null
  const dismiss = () => {
    writeSeen(sitting.end)
    setSeen(sitting.end)
  }
  return <SittingCard sitting={sitting} event={event} decimals={decimals} onDismiss={dismiss} />
}

function SittingCard({ sitting, event, decimals, onDismiss }: { sitting: SittingSummary; event: string; decimals: 2 | 3; onDismiss: () => void }) {
  const { coachFocus } = useSettings()
  const solves = useEventSolves(event)
  const top = useMemo(() => (solves ? findings(solves)[0] : undefined), [solves])
  const focus = coachFocus?.event === event ? coachFocus : null
  const progress = useProgress(focus, solves ?? [])
  const diff = sitting.mean != null && sitting.usual != null ? sitting.mean - sitting.usual : null

  return (
    <div className="coach-card" role="status">
      <div className="coach-card-head">
        <b>Last sitting</b>
        <span className="dim">{sitting.count} solves</span>
      </div>
      <p>
        Mean <b className="num">{formatMs(sitting.mean, decimals)}</b>
        {diff != null && <span className={diff <= 0 ? 'good' : 'bad'}>, {formatMs(Math.abs(diff))} {diff <= 0 ? 'faster' : 'slower'} than usual</span>}
        {' · '}best <b className="num">{formatMs(sitting.best, decimals)}</b>
      </p>
      {focus && progress ? (
        <ProgressLine focus={focus} progress={progress} />
      ) : (
        top && <p>{top.title}. Try {DRILLS[top.kind].title.toLowerCase()} ({DRILLS[top.kind].minutes} min).</p>
      )}
      <div className="row">
        <a className="btn primary" href="#/insights" onClick={onDismiss}>Open Coach</a>
        <button type="button" className="btn ghost" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  )
}
