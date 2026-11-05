import { useCallback, useEffect, useRef, useState } from 'react'
import { onTimerStatus } from '../lib/deviceStore'
import { inspectionCaller, preloadCalls, type Voice } from '../lib/voice'
import { INSPECTION_MS, inspectionPenalty, initialTimer, timerReducer, type TimerConfig, type TimerEvent, type TimerResult, type TimerState } from '../lib/timerMachine'

const READY_BUZZ_MS = 20

export type EngineSource = 'manual' | 'external'

export interface EngineConfig extends TimerConfig {
  voice: Voice
  source: EngineSource
  /** False while another view (or a dialog) owns the keyboard */
  enabled: boolean
}

export interface Engine {
  state: TimerState
  /** Solve time while running; inspection elapsed while inspecting */
  now: number
  /** Hold / ready colour reported by an external timer */
  signal: 'hold' | 'ready' | null
  pointerDown: (e: React.PointerEvent) => void
  pointerUp: (e: React.PointerEvent) => void
}

/** Typing in a field or using a dialog must never start the timer. */
function ignoredTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el?.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [role="menu"]')
}

const inspStartOf = (s: TimerState): number | undefined =>
  s.phase === 'inspecting' ? s.inspStart : s.phase === 'holding' || s.phase === 'ready' ? s.inspStart : undefined

export function useTimerEngine(cfg: EngineConfig, onFinish: (r: TimerResult) => void): Engine {
  const [state, setState] = useState<TimerState>(initialTimer)
  const [now, setNow] = useState(0)
  const [signal, setSignal] = useState<'hold' | 'ready' | null>(null)
  const stateRef = useRef(state)
  const cfgRef = useRef(cfg)
  const finishRef = useRef(onFinish)
  const caller = useRef(inspectionCaller())
  useEffect(() => preloadCalls(cfg.voice), [cfg.voice])
  useEffect(() => {
    cfgRef.current = cfg
    finishRef.current = onFinish
  })

  const commit = useCallback((next: TimerState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const dispatch = useCallback((ev: TimerEvent) => {
    const prev = stateRef.current
    const next = timerReducer(prev, ev, cfgRef.current)
    if (next === prev) return
    commit(next)
    // a short buzz when the time turns green, so a thumb on a phone feels when to let go (no-op without a motor)
    if (next.phase === 'ready' && prev.phase === 'holding') navigator.vibrate?.(READY_BUZZ_MS)
    if (next.phase === 'stopped' && prev.phase === 'running') {
      setNow(next.result.time)
      finishRef.current(next.result)
    }
  }, [commit])

  // keyboard: space arms and starts, any key stops, escape cancels
  useEffect(() => {
    if (!cfg.enabled) return
    const down = (e: KeyboardEvent) => {
      const s = stateRef.current
      if (s.phase !== 'running' && ignoredTarget(e.target)) return
      if (e.key === 'Escape' && s.phase !== 'idle') {
        e.preventDefault()
        dispatch({ type: 'cancel' })
        return
      }
      if (cfgRef.current.source === 'external') {
        // with a Stackmat or GAN timer the keyboard only starts inspection
        if (e.code === 'Space' && !e.repeat && cfgRef.current.inspection && s.phase === 'idle') {
          e.preventDefault()
          dispatch({ type: 'press', at: performance.now() })
          dispatch({ type: 'release', at: performance.now() })
        }
        return
      }
      if (s.phase === 'running') {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
        e.preventDefault()
        dispatch({ type: 'press', at: performance.now() })
        return
      }
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      dispatch({ type: 'press', at: performance.now() })
    }
    const up = (e: KeyboardEvent) => {
      if (cfgRef.current.source === 'external') return
      const s = stateRef.current
      if (e.code === 'Space' || s.phase === 'stopped') dispatch({ type: 'release', at: performance.now() })
    }
    // losing focus mid-hold would leave the timer stuck in "holding"
    const blur = () => {
      const p = stateRef.current.phase
      if (p === 'holding' || p === 'ready' || p === 'stopped' || p === 'armInspect') dispatch({ type: 'release', at: performance.now() })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [cfg.enabled, dispatch])

  // frame loop: hold timing, inspection countdown and voice, the running display
  useEffect(() => {
    const p = state.phase
    if (p !== 'holding' && p !== 'ready' && p !== 'running' && p !== 'inspecting') return
    let raf = 0
    const loop = () => {
      const t = performance.now()
      const s = stateRef.current
      if (s.phase === 'holding') dispatch({ type: 'tick', at: t })
      const insp = inspStartOf(s)
      if (s.phase === 'running') setNow(t - s.start)
      else if (insp != null) {
        const elapsed = t - insp
        setNow(elapsed)
        caller.current(cfgRef.current.voice, insp, elapsed)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [state.phase, dispatch])

  // external timers report their own state; mirror it
  useEffect(() => {
    if (cfg.source !== 'external' || !cfg.enabled) return
    // hands went on the timer since the last result; without it, a 'stopped' is a stale display (a Stackmat shows its last time on connect)
    let armed = false
    return onTimerStatus((status, time) => {
      const at = performance.now()
      const s = stateRef.current
      setSignal(status === 'both' || status === 'left' || status === 'right' ? 'hold' : status === 'ready' ? 'ready' : null)
      if (status === 'both' || status === 'ready') armed = true
      if (status === 'running' && s.phase !== 'running') {
        const insp = s.phase === 'inspecting' ? s.inspStart : undefined
        commit({ phase: 'running', start: at - time, splits: [], penalty: insp != null ? inspectionPenalty(at - time - insp) : 'ok' })
      } else if (status === 'stopped' && (s.phase === 'running' || (armed && time > 0 && s.phase !== 'stopped'))) {
        // the stop packet carries the whole time, so a solve whose start packet was lost is still recorded
        armed = false
        const result: TimerResult = { time, penalty: s.phase === 'running' ? s.penalty : 'ok', splits: [time] }
        commit({ phase: 'stopped', result })
        setNow(time)
        finishRef.current(result)
      } else if (status === 'idle' && s.phase === 'stopped') {
        commit(initialTimer)
      }
    })
  }, [cfg.source, cfg.enabled, commit])

  const pointerDown = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current
    if (!cfgRef.current.enabled || cfgRef.current.source === 'external') return
    if (s.phase !== 'running' && ignoredTarget(e.target)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dispatch({ type: 'press', at: performance.now() })
  }, [dispatch])

  const pointerUp = useCallback((e: React.PointerEvent) => {
    if (!cfgRef.current.enabled || cfgRef.current.source === 'external') return
    if (stateRef.current.phase === 'idle' && ignoredTarget(e.target)) return
    dispatch({ type: 'release', at: performance.now() })
  }, [dispatch])

  return { state, now, signal, pointerDown, pointerUp }
}

/** What the big number reads during inspection. */
export function inspectionLabel(elapsed: number): string {
  if (elapsed > INSPECTION_MS + 2000) return 'DNF'
  if (elapsed > INSPECTION_MS) return '+2'
  return String(Math.max(1, Math.ceil((INSPECTION_MS - elapsed) / 1000)))
}
