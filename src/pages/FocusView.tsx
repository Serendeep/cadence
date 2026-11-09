import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { inspectionLabel, useTimerEngine } from '../hooks/useTimerEngine'
import { useDevices } from '../lib/deviceStore'
import { eventById, isBlind, twistySupports } from '../lib/events'
import { scrambledState } from '../lib/smartSolve'
import { isFocused, type TimerResult } from '../lib/timerMachine'
import { effective, formatMs, parseTyped } from '../lib/time'
import type { InputSource, Penalty } from '../lib/types'
import { CoachCard } from '../components/Coach'
import { DrillBanner } from '../components/DrillBanner'
import { CubeNet, Twisty } from '../components/Cube'
import { Results } from '../components/Results'
import { TimerSides } from '../components/TimerSides'
import { TimerConfigBar } from '../components/TimerConfigBar'
import { ScrambleLine } from '../components/ScrambleLine'
import type { TimerViewProps } from './timerTypes'

export function FocusView({ data, settings, drill, scramble, scrambleError, onNewScramble, onPrevious, save, onFocusChange }: TimerViewProps & { onFocusChange: (f: boolean) => void }) {
  const devices = useDevices()
  const external = devices.external != null && (settings.input === 'stackmat' || settings.input === 'gantimer')
  const typing = settings.input === 'typing'
  const source: InputSource = external ? (devices.external!.kind === 'stackmat' ? 'stackmat' : 'gantimer') : 'keyboard'
  const onFinish = useCallback((r: TimerResult) => save({ ...r, source }), [save, source])
  const engine = useTimerEngine(
    {
      inspection: settings.inspection && !isBlind(data.session?.event ?? '333'),
      holdMs: settings.holdMs,
      voice: settings.inspectionVoice,
      source: external ? 'external' : 'manual',
      enabled: !typing,
    },
    onFinish,
  )
  const { state, now, signal } = engine
  const focused = isFocused(state)
  useEffect(() => onFocusChange(focused), [focused, onFocusChange])
  useEffect(() => () => onFocusChange(false), [onFocusChange])

  const last = data.solves[data.solves.length - 1]
  const dec = settings.decimals
  const display = useMemo(() => {
    const inInspection = state.phase === 'inspecting' || ((state.phase === 'holding' || state.phase === 'ready') && state.inspStart != null)
    if (inInspection) return inspectionLabel(now)
    if (state.phase === 'holding' || state.phase === 'ready' || state.phase === 'armInspect') return formatMs(0, dec)
    if (state.phase === 'running') {
      if (settings.timerUpdate === 'hidden') return 'solve'
      if (settings.timerUpdate === 'seconds') return String(Math.floor(now / 1000))
      return formatMs(now, dec)
    }
    if (state.phase === 'stopped') return formatMs(effective(state.result.time, state.result.penalty), dec)
    return last ? formatMs(effective(last.time, last.penalty), dec) : formatMs(0, dec)
  }, [state, now, last, dec, settings.timerUpdate])

  const tone = signal ?? (state.phase === 'holding' ? 'hold' : state.phase === 'ready' ? 'ready' : state.phase === 'inspecting' && now > 12000 ? 'insp-warn' : '')
  const hint = (() => {
    if (typing) return ''
    if (state.phase === 'inspecting') return external ? 'Start the timer when ready' : 'Hold space to get ready'
    if (state.phase !== 'idle') return ''
    if (external) return 'Timer connected. Put both hands on the pads.'
    if (settings.input === 'stackmat' || settings.input === 'gantimer') return 'Timer not connected. Choose the input again to reconnect.'
    if (settings.input === 'smartcube') return 'Cube not connected. Choose the input again to connect.'
    return data.solves.length ? '' : 'Hold space, or touch and hold, then release to start'
  })()

  const ev = eventById(data.session?.event ?? '333')
  const preview = useMemo(() => (scramble && ev.is3x3 ? scrambledState(scramble) : null), [scramble, ev.is3x3])

  return (
    <div className="page timer-page" onPointerDown={engine.pointerDown} onPointerUp={engine.pointerUp} onPointerCancel={engine.pointerUp}>
      <div className="band top">
        <TimerConfigBar data={data} settings={settings} />
        {drill && <DrillBanner drill={drill} solves={data.solves} decimals={settings.decimals} />}
        <ScrambleLine scramble={scramble} scrambleError={scrambleError} onNewScramble={onNewScramble} onPrevious={onPrevious} />
      </div>

      <div className="stage">
        {typing ? (
          <TypedEntry onSave={(r) => save({ ...r, source: 'typing' })} />
        ) : (
        <motion.div
          className={`bigtime ${tone}`}
          animate={{ scale: state.phase === 'running' ? 1.06 : state.phase === 'ready' ? 0.98 : 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          aria-live={state.phase === 'stopped' || state.phase === 'idle' ? 'polite' : 'off'}
        >
          {display}
        </motion.div>
        )}
        <div className="hint chrome">{hint}</div>
        <TimerSides session={data.session} solves={data.solves} values={data.values} stats={data.stats} decimals={dec} />
      </div>

      <div className="band bottom chrome">
        {settings.coach && !drill && !last?.drill && (state.phase === 'idle' || state.phase === 'stopped') && <CoachCard solves={data.solves} event={ev.id} decimals={dec} />}
        {data.solves.length > 0 ? (
          <Results solves={data.solves} stats={data.stats} decimals={dec} />
        ) : (
          <div className="results firstrun">
            New here?{' '}
            <a href="#/settings?import">Import from csTimer</a>
            {' · '}
            <a href="#/settings?devices">Connect a timer or cube</a>
          </div>
        )}
        {!typing && <div className="keys">
          <kbd>space</kbd> start · <kbd>esc</kbd> cancel · any key stops
        </div>}
      </div>

      {settings.scramblePreview && scramble && (
        <div className="preview-corner chrome">
          {preview ? <CubeNet state={preview} size={10} /> : twistySupports(ev.id) && <Twisty event={ev.id} setup={scramble} label={`Scramble preview for ${ev.name}`} />}
        </div>
      )}
    </div>
  )
}

/** Manual entry: type a time and press Enter. Replaces the big time while the input is "typing". */
function TypedEntry({ onSave }: { onSave: (r: { time: number; penalty: Penalty }) => void }) {
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const r = parseTyped(text)
    setBad(r == null)
    if (!r) return
    onSave(r)
    setText('')
  }
  return (
    <form className="typed" onSubmit={submit}>
      <input
        className={`bigtime typed-input ${bad ? 'bad' : ''}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setBad(false)
        }}
        placeholder="0.00"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        aria-label="Time"
        aria-invalid={bad}
        aria-describedby="typed-help"
        autoFocus
      />
      <p id="typed-help" className={`typed-help ${bad ? 'bad' : ''}`}>{bad ? 'Try 12.34, 1234, 1:02.50, 12.34+ or DNF' : 'Type a time and press Enter'}</p>
    </form>
  )
}
