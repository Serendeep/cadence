import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { inspectionLabel } from '../hooks/useTimerEngine'
import { METHOD_PHASES } from '../lib/cfop'
import { crossSolved, f2lSolved, FACES, ollSolved, type CubeState } from '../lib/cube'
import { disconnectCube, markCubeSolved, onCubeMove, onCubeOrientation, resetCubeOrientation, useDevices } from '../lib/deviceStore'
import { diag } from '../lib/diag'
import { isBlind } from '../lib/events'
import { setSettings } from '../lib/settings'
import { setSolving } from '../lib/solving'
import { rouxProgress } from '../lib/roux'
import { finishSolve, newTracker, resetTracker, scrambleHint, solveOpen, trackMove, type SmartFinish, type Tracker, phaseCounts } from '../lib/smartSolve'
import { createRotationDetector, solverFrame, timeline } from '../lib/rotations'
import { inspectionPenalty } from '../lib/timerMachine'
import { effective, formatMs } from '../lib/time'
import type { Solve, TimedMove } from '../lib/types'
import { inspectionCaller, preloadCalls } from '../lib/voice'
import { Twisty, type TwistyHandle } from '../components/Cube'
import { CoachCard } from '../components/Coach'
import { DrillBanner } from '../components/DrillBanner'
import { PhaseBar } from '../components/Bits'
import { LastSolveControls } from '../components/Results'
import { TimerConfigBar } from '../components/TimerConfigBar'
import { ScrambleLine } from '../components/ScrambleLine'
import type { TimerViewProps } from './timerTypes'

/** How far into CFOP the cube is right now, colour neutral: 0 none, 1 cross, 2 F2L, 3 OLL. */
function cfopProgress(cube: CubeState): number {
  let best = 0
  for (const f of FACES) {
    if (ollSolved(cube, f)) return 3
    if (f2lSolved(cube, f)) best = Math.max(best, 2)
    else if (crossSolved(cube, f)) best = Math.max(best, 1)
  }
  return best
}

export function LabView({ data, settings, drill, scramble, scrambleError, onNewScramble, onPrevious, save }: TimerViewProps) {
  const devices = useDevices()
  const [tracker, setTrackerState] = useState<Tracker | null>(null)
  const [now, setNow] = useState(0)
  const [completed, setCompleted] = useState<{ previousId: number | undefined; solve: Solve } | null>(null)
  const [inspStart, setInspStart] = useState<number | null>(null)
  const [reached, setReached] = useState<number[]>([])
  const twisty = useRef<TwistyHandle | null>(null)
  // the source of truth for move handling: moves can arrive faster than React re-renders, so each
  // move must build on the previous move's result, never on the last rendered state
  const trackerRef = useRef(tracker)
  const setTracker = useCallback((next: Tracker | null) => {
    trackerRef.current = next
    setTrackerState(next)
  }, [])
  // a solve whose connection dropped: the clock stops at the last move and moves are ignored until it is finished or discarded
  const pausedRef = useRef(false)
  const [paused, setPausedState] = useState(false)
  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p
    setPausedState(p)
  }, [])
  // whole-cube rotations in the current solve; a ref for the same reason as the tracker
  const detector = useRef(createRotationDetector())
  const rotationsRef = useRef<TimedMove[]>([])
  const [rotations, setRotations] = useState<TimedMove[]>([])
  // only cubes with a gyroscope send orientation; without one, rotation controls would only ever show a dash
  const [hasGyro, setHasGyro] = useState(false)
  const inspRef = useRef(inspStart)
  const caller = useRef(inspectionCaller())
  const voiceRef = useRef(settings.inspectionVoice)
  const inspectRef = useRef(false)
  useEffect(() => {
    inspRef.current = inspStart
    voiceRef.current = settings.inspectionVoice
  })
  useEffect(() => preloadCalls(settings.inspectionVoice), [settings.inspectionVoice])
  const inspect = settings.inspection && !isBlind(data.session?.event ?? '333')
  useEffect(() => {
    inspectRef.current = inspect
  })

  // a new scramble starts a new attempt; the physical cube is assumed solved after the last one
  useEffect(() => {
    if (!scramble) return
    const t = trackerRef.current
    setTracker(newTracker(scramble, t && t.phase !== 'solving' ? t.cube : undefined))
    setReached([])
  }, [scramble, setTracker])


  const { method } = settings
  const record = useCallback(
    (t: Tracker, finished: SmartFinish) => {
      diag('lab.solve.finished', { moves: finished.moves.length, rotations: rotationsRef.current.length, ms: finished.time })
      const insp = inspRef.current
      setInspStart(null)
      setNow(finished.time)
      const result = {
        time: finished.time,
        penalty: insp != null ? inspectionPenalty(t.start - insp) : 'ok',
        splits: finished.splits,
        moves: finished.moves,
        rotations: rotationsRef.current,
        source: 'smartcube' as const,
      }
      // Keep the result visible while saving and reloading a large solve history.
      setCompleted({
        previousId: data.solves.at(-1)?.id,
        solve: {
          ...result,
          sessionId: data.session?.id ?? 0,
          scramble: scramble ?? '',
          event: data.session?.event ?? '333',
          date: Date.now(),
          method,
        },
      })
      save(result)
    },
    [save, data.solves, data.session, scramble, method],
  )

  const onMove = useCallback(
    (m: string, at: number) => {
      const t = trackerRef.current
      if (!t || pausedRef.current) return
      twisty.current?.addMove(m)
      detector.current.faceTurn(m, at)
      const { tracker: next, finished } = trackMove(t, m, at, method)
      setTracker(next)
      // the scramble is done: inspection starts now
      if (t.phase !== 'armed' && next.phase === 'armed' && inspectRef.current && inspRef.current == null) {
        inspRef.current = performance.now()
        setInspStart(inspRef.current)
      }
      if (t.phase !== 'solving' && next.phase === 'solving') {
        detector.current.reset()
        rotationsRef.current = []
        setRotations([])
      }
      if (next.phase === 'solving') {
        const p = method === 'roux' ? rouxProgress(next.cube) : cfopProgress(next.cube)
        setReached((r) => (p > r.length ? [...r, ...Array(p - r.length).fill(Math.max(0, at - next.start))] : r))
      }
      if (finished) record(next, finished)
    },
    [record, setTracker, method],
  )

  // moves made while the cube was away never arrive, so a dropped solve cannot be trusted to finish by itself
  const link = devices.cube?.link
  useEffect(() => {
    if (!link) return
    const t = trackerRef.current
    if (t && solveOpen(t)) {
      setPaused(true)
      setNow(t.moves[t.moves.length - 1].t)
    } else {
      inspRef.current = null
      setInspStart(null)
    }
  }, [link, setPaused])

  useEffect(() => onCubeMove(onMove), [onMove])
  const busy = (tracker != null && solveOpen(tracker)) || inspStart != null
  useEffect(() => setSolving(busy), [busy])
  useEffect(() => () => setSolving(false), [])
  useEffect(() => {
    if (!settings.trackRotations) return
    return onCubeOrientation((q) => {
      setHasGyro(true)
      twisty.current?.setOrientation(q)
      const t = trackerRef.current
      if (t?.phase !== 'solving' || pausedRef.current) return
      const at = performance.now()
      const r = detector.current.feed(q, at)
      if (!r) return
      rotationsRef.current = [...rotationsRef.current, { m: r, t: Math.max(0, Math.round(at - t.start)) }]
      setRotations(rotationsRef.current)
    })
  }, [settings.trackRotations])

  useEffect(() => {
    if (tracker?.phase !== 'solving' && inspStart == null) return
    let raf = 0
    const loop = () => {
      const t = trackerRef.current
      const insp = inspRef.current
      if (t?.phase === 'solving' && solveOpen(t)) {
        if (!pausedRef.current) setNow(performance.now() - t.start)
      } else if (insp != null) {
        const elapsed = performance.now() - insp
        setNow(elapsed)
        caller.current(voiceRef.current, insp, elapsed)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tracker?.phase, inspStart])

  const finishNow = () => {
    const t = trackerRef.current
    if (!t) return
    const { tracker: next, finished } = finishSolve(t, method)
    setPaused(false)
    twisty.current?.reset('')
    setTracker(next)
    if (finished) record(next, finished)
  }

  const markSolved = () => {
    setPaused(false)
    markCubeSolved()
    twisty.current?.reset('')
    const t = trackerRef.current
    setTracker(t ? resetTracker(t) : t)
    setReached([])
    setInspStart(null)
  }

  const solving = tracker != null && solveOpen(tracker)
  const open = solving
  const moves = tracker?.moves ?? []
  const savedLast = data.solves.at(-1)
  const pending = completed && completed.solve.sessionId === data.session?.id && completed.previousId === savedLast?.id
  if (completed && !pending) setCompleted(null)
  const last = pending ? completed.solve : savedLast
  const display = solving
    ? formatMs(now, settings.decimals)
    : inspStart != null
      ? inspectionLabel(now)
      : last
        ? formatMs(effective(last.time, last.penalty), settings.decimals)
        : formatMs(0, settings.decimals)
  const tps = solving && now > 0 ? moves.length / (now / 1000) : last?.moves && last.time ? last.moves.length / (last.time / 1000) : 0
  const hint = tracker ? scrambleHint(tracker) : null
  const lastSplits = !solving && last?.splits?.length === 4 ? last.splits : null
  const shownRotations = solving ? rotations.length : last?.rotations?.length
  const fullStream = solverFrame(timeline(moves, solving ? rotations : last?.rotations ?? []))
  // keyed by position in the whole solve so items keep their identity (and do not re-animate) as the list scrolls
  const stream = fullStream.slice(-TICKER_ITEMS).map((item, i) => ({ ...item, key: Math.max(0, fullStream.length - TICKER_ITEMS) + i }))

  return (
    <div className="page lab">
      <div className="conn">
        <i className={link ? 'live off' : 'live'} />
        <span>
          {devices.cube?.name ?? 'Smart cube'}
          {link === 'reconnecting' ? ' · reconnecting…' : link === 'lost' ? ' · disconnected' : devices.cube?.battery != null ? ` · battery ${devices.cube.battery}%` : ''}
        </span>
        {open ? (
          <button type="button" className="btn ghost" onClick={finishNow} title="Stop at your last turn and save, if the cube is solved but the timer still runs">
            Finish solve
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={markSolved} title="Your cube is solved but the screen disagrees">
            Mark solved
          </button>
        )}
        {paused && (
          <button type="button" className="btn ghost" onClick={markSolved}>
            Discard
          </button>
        )}
        {settings.trackRotations && hasGyro && (
          <button type="button" className="btn ghost" onClick={resetCubeOrientation} title="Hold the cube white side up, green side facing you, then press">
            Reset orientation
          </button>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            disconnectCube()
            setSettings({ input: 'keyboard' })
          }}
        >
          Disconnect
        </button>
        <span style={{ flex: 1 }} />
        <TimerConfigBar data={data} settings={settings} />
        {drill && <DrillBanner drill={drill} solves={data.solves} decimals={settings.decimals} />}
      </div>

      <div className="cube3d">
        <Twisty event="333" visualization="3D" label="Live view of your cube" onReady={(h) => (twisty.current = h)} />
      </div>

      <div className="labside">
        <div className="status">
          {paused ? 'Connection dropped. Finish the solve or discard it.' : solving ? `Solving · ${METHOD_PHASES[method][reached.length] ?? ''}` : tracker?.phase === 'armed' ? 'Scrambled. The timer starts on your first turn.' : null}
        </div>
        <motion.div className="labtime" animate={{ scale: solving ? 1.03 : 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
          {display}
        </motion.div>
        <div className="live-stats">
          <div>tps<b>{tps ? tps.toFixed(2) : '—'}</b></div>
          <div>moves<b>{solving ? moves.length : last?.moves?.length ?? '—'}</b></div>
          {settings.trackRotations && (hasGyro || shownRotations != null) && <div>rotations<b>{shownRotations ?? '—'}</b></div>}
          <div>ao5<b>{formatMs(data.stats.current[5])}</b></div>
          <div>ao12<b>{formatMs(data.stats.current[12])}</b></div>
        </div>

        {lastSplits && (
          <div className="labphases">
            <PhaseBar splits={lastSplits} method={last?.method ?? 'cfop'} counts={last?.moves?.length ? phaseCounts(lastSplits, last.moves, last.rotations ?? []) : undefined} />
          </div>
        )}

        {tracker?.phase === 'scrambling' && hint && (
          <div className="guide">
            {hint.undo ? (
              <span className="undo">
                Wrong turn. Undo with <b className="mono">{hint.undo}</b>
              </span>
            ) : (
              <span>
                Scramble your cube · {hint.done} of {tracker.scramble.length}
              </span>
            )}
            {/* the whole scramble stays put: done moves fade, the next one is marked, so nothing jumps while you turn */}
            <div className={`moves ${hint.undo ? 'paused' : ''}`} aria-label={`Next move ${tracker.scramble[hint.done] ?? ''}`}>
              {tracker.scramble.map((m, i) => (
                <span key={i} className={i < hint.done ? 'done' : i === hint.done ? (hint.half ? 'cur half' : 'cur') : undefined}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {stream.length === 0 ? (
          <p className="ticker-empty">Turn the cube and your moves appear here.</p>
        ) : (
          <div className="ticker" aria-label="Recent moves">
            <div className="stream">
              <AnimatePresence initial={false}>
                {stream.map((m) => (
                  <motion.span key={m.key} className={m.rotation ? 'rot' : undefined} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                    {m.rotation ? `(${m.m})` : m.m}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {!solving && data.solves.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <ScrambleLine scramble={scramble} scrambleError={scrambleError} onNewScramble={onNewScramble} onPrevious={onPrevious} showText={tracker?.phase !== 'scrambling'} />
          {settings.coach && !drill && !busy && <CoachCard solves={data.solves} event={data.session?.event ?? '333'} decimals={settings.decimals} />}
          {savedLast && <LastSolveControls last={savedLast} stats={data.stats} />}
        </div>
      )}
    </div>
  )
}

const TICKER_ITEMS = 28


