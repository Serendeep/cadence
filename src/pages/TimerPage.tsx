import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inspectionLabel, useTimerEngine } from '../hooks/useTimerEngine'
import { useSessionData, type SessionData } from '../hooks/useSessionData'
import { addSolve, createSession, updateSession } from '../lib/db'
import { connectCube, connectExternal, disconnectCube, disconnectExternal, useDevices, type CubeKind } from '../lib/deviceStore'
import { bluetoothAvailable } from '../lib/devices'
import { EVENTS, eventById, isBlind, twistySupports } from '../lib/events'
import { drillScramble } from '../lib/drills'
import { nextScramble } from '../lib/scramble'
import { setSettings, useSettings, type DrillMode, type InputMethod, type Settings } from '../lib/settings'
import { scrambledState } from '../lib/smartSolve'
import { isFocused, type TimerResult } from '../lib/timerMachine'
import { effective, formatMs, parseTyped } from '../lib/time'
import { toast } from '../lib/toast'
import type { DrillKind, InputSource, Penalty, TimedMove } from '../lib/types'
import { CoachCard } from '../components/Coach'
import { DrillBanner } from '../components/DrillBanner'
import { CubeNet, Twisty } from '../components/Cube'
import { Menu } from '../components/Menu'
import { Results } from '../components/Results'
import { TimerSides } from '../components/TimerSides'
import { BackIcon, CopyIcon } from '../components/icons'
import { LabView } from './LabView'

export interface SaveInput {
  time: number
  penalty: Penalty
  splits?: number[]
  moves?: TimedMove[]
  rotations?: TimedMove[]
  source: InputSource
}

const INPUT_LABEL: Record<InputMethod, string> = { keyboard: 'keyboard', typing: 'typing', stackmat: 'stackmat', gantimer: 'gan timer', smartcube: 'smart cube' }

/** Owns the scramble and saving; shows the Lab view when a smart cube is connected on a 3x3 event. */
export function TimerPage({ onFocusChange }: { onFocusChange: (f: boolean) => void }) {
  const settings = useSettings()
  const data = useSessionData()
  const devices = useDevices()
  const event = data.session?.event ?? '333'
  // drill mode belongs to the drill session; picking another session from the menu pauses it
  const drill = settings.drill && settings.drill.sessionId === data.session?.id ? settings.drill : null
  const drillKind = drill?.kind
  const drillCases = drill?.cases
  const [scramble, setScramble] = useState<{ text: string; event: string; drill?: DrillKind } | null>(null)
  const [scrambleError, setScrambleError] = useState(false)
  const scrambleRef = useRef(scramble)
  const history = useRef<string[]>([])
  useEffect(() => {
    scrambleRef.current = scramble
  })

  const load = useCallback(() => {
    ;(drillKind ? drillScramble(drillKind, drillCases) : nextScramble(event))
      .then((text) => {
        setScrambleError(false)
        const cur = scrambleRef.current
        if (cur && cur.event === event && cur.drill === drillKind) history.current = [cur.text, ...history.current].slice(0, 20)
        setScramble({ text, event, drill: drillKind })
      })
      .catch(() => setScrambleError(true))
  }, [event, drillKind, drillCases])

  useEffect(() => {
    history.current = []
    load()
  }, [load])

  const previous = () => {
    const [prev, ...rest] = history.current
    if (!prev) return toast('No earlier scramble in this sitting')
    history.current = rest
    setScramble({ text: prev, event, drill: drillKind })
  }

  const sessionId = data.session?.id
  const { method } = settings
  const save = useCallback(
    (r: SaveInput) => {
      const scr = scrambleRef.current
      if (sessionId == null || !scr) return
      void addSolve({
        sessionId,
        time: Math.round(r.time),
        penalty: r.penalty,
        scramble: scr.text,
        event: scr.event,
        date: Date.now(),
        splits: r.splits && r.splits.length > 1 ? r.splits.map(Math.round) : undefined,
        method: r.splits?.length === 4 ? method : undefined,
        moves: r.moves,
        rotations: r.rotations?.length ? r.rotations : undefined,
        source: r.source,
        drill: scr.drill,
      })
      load()
    },
    [sessionId, load, method],
  )

  const lab = devices.cube != null && eventById(event).is3x3
  useEffect(() => {
    if (lab) onFocusChange(false)
  }, [lab, onFocusChange])

  const shared: ViewProps = {
    data, settings, drill, scramble: scramble?.event === event && scramble.drill === drillKind ? scramble.text : null, scrambleError, onNewScramble: load, onPrevious: previous, save,
  }
  return lab ? <LabView {...shared} /> : <FocusView {...shared} onFocusChange={onFocusChange} />
}

export interface ViewProps {
  data: SessionData
  settings: Settings
  drill: DrillMode | null
  scramble: string | null
  scrambleError: boolean
  onNewScramble: () => void
  onPrevious: () => void
  save: (r: SaveInput) => void
}

type ScrambleLineProps = Pick<ViewProps, 'scramble' | 'scrambleError' | 'onNewScramble' | 'onPrevious'> & {
  /** False while another part of the screen already shows the scramble; the buttons stay */
  showText?: boolean
}

export function ScrambleLine({ scramble, scrambleError, onNewScramble, onPrevious, showText = true }: ScrambleLineProps) {
  const long = (scramble?.length ?? 0) > 120
  return (
    <div className={`scramble chrome ${long ? 'long' : ''}`} aria-live="polite">
      {showText && (scramble ?? (scrambleError ? 'Could not generate a scramble.' : 'Generating scramble…'))}
      <div className="tools">
        <button type="button" className="btn ghost iconbtn" aria-label="Previous scramble" onClick={onPrevious}>
          <BackIcon />
        </button>
        <button type="button" className="btn ghost" onClick={onNewScramble}>
          Next scramble
        </button>
        <button
          type="button"
          className="btn ghost iconbtn"
          aria-label="Copy scramble"
          onClick={() => scramble && navigator.clipboard.writeText(scramble).then(() => toast('Scramble copied'))}
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  )
}

function FocusView({ data, settings, drill, scramble, scrambleError, onNewScramble, onPrevious, save, onFocusChange }: ViewProps & { onFocusChange: (f: boolean) => void }) {
  const devices = useDevices()
  const external = devices.external != null && (settings.input === 'stackmat' || settings.input === 'gantimer')
  const typing = settings.input === 'typing'
  const source: InputSource = external ? (devices.external!.kind === 'stackmat' ? 'stackmat' : 'gantimer') : 'keyboard'
  const onFinish = useCallback((r: TimerResult) => save({ ...r, source }), [save, source])
  const engine = useTimerEngine(
    {
      inspection: settings.inspection && !isBlind(data.session?.event ?? '333'),
      holdMs: settings.holdMs,
      phases: external ? 1 : settings.phases,
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
    if (state.phase === 'running' && settings.phases > 1 && !external) return `phase ${state.splits.length + 1} of ${settings.phases}`
    if (state.phase === 'inspecting') return external ? 'Start the timer when ready' : 'Hold space to get ready'
    if (state.phase !== 'idle') return ''
    if (external) return 'Timer connected. Put both hands on the pads.'
    if (settings.input === 'stackmat' || settings.input === 'gantimer') return 'Timer not connected. Choose the input again to reconnect.'
    return data.solves.length ? '' : 'Hold space, or touch and hold, then release to start'
  })()

  const ev = eventById(data.session?.event ?? '333')
  const preview = useMemo(() => (scramble && ev.is3x3 ? scrambledState(scramble) : null), [scramble, ev.is3x3])

  return (
    <div className="page timer-page" onPointerDown={engine.pointerDown} onPointerUp={engine.pointerUp} onPointerCancel={engine.pointerUp}>
      <div className="band top">
        <ConfigBar data={data} settings={settings} />
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
        <TimerSides solves={data.solves} values={data.values} stats={data.stats} decimals={dec} />
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

/** Event, session, inspection, input and phases as a row of quiet text menus. */
export function ConfigBar({ data, settings }: { data: SessionData; settings: Settings }) {
  const devices = useDevices()
  const ev = eventById(data.session?.event ?? '333')

  const chooseEvent = async (id: string) => {
    const s = data.session
    if (s?.id == null) return
    if (data.solves.length === 0) return void updateSession(s.id, { event: id })
    const existing = data.sessions.find((x) => x.event === id)
    const target = existing?.id ?? (await createSession(eventById(id).short, id))
    setSettings({ sessionId: target })
  }

  const chooseInput = (input: InputMethod, cube?: CubeKind) => {
    setSettings({ input })
    if (input === 'stackmat' || input === 'gantimer') {
      disconnectCube()
      void connectExternal(input)
    } else if (input === 'smartcube' && cube) {
      disconnectExternal()
      void connectCube(cube)
    } else {
      disconnectExternal()
      disconnectCube()
    }
  }

  const bt = bluetoothAvailable()
  const inputLabel = devices.connecting ? `connecting ${devices.connecting}…` : INPUT_LABEL[settings.input]

  return (
    <div className="cfg chrome">
      <Menu
        label="Puzzle"
        trigger={<b>{ev.short}</b>}
        items={EVENTS.map((e) => ({ key: e.id, label: e.name, checked: e.id === ev.id, onSelect: () => void chooseEvent(e.id) }))}
      />
      <Menu
        label="Session"
        trigger={<>session <b>{data.session?.name ?? '…'}</b></>}
        items={[
          ...data.sessions.map((s) => ({ key: String(s.id), label: s.name, hint: eventById(s.event).short, checked: s.id === data.session?.id, onSelect: () => setSettings({ sessionId: s.id! }) })),
          'sep' as const,
          {
            key: 'new',
            label: 'New session',
            onSelect: () => void createSession(`${ev.short} ${data.sessions.length + 1}`, ev.id).then((id) => setSettings({ sessionId: id })),
          },
        ]}
      />
      {isBlind(ev.id) ? (
        <span className="textbtn" title="WCA blindfolded events have no inspection">inspection <b>none</b></span>
      ) : (
        <button type="button" className="textbtn" onClick={() => setSettings({ inspection: !settings.inspection })} aria-pressed={settings.inspection}>
          inspection <b>{settings.inspection ? '15s' : 'off'}</b>
        </button>
      )}
      <Menu
        label="Input"
        trigger={<>input <b>{inputLabel}</b></>}
        items={[
          { key: 'kb', label: 'Keyboard and touch', checked: settings.input === 'keyboard', onSelect: () => chooseInput('keyboard') },
          { key: 'ty', label: 'Type times in', checked: settings.input === 'typing', onSelect: () => chooseInput('typing') },
          { key: 'sm', label: 'Stackmat (audio jack)', checked: settings.input === 'stackmat', onSelect: () => chooseInput('stackmat') },
          ...(bt
            ? [
                { key: 'gt', label: 'GAN Smart Timer', checked: settings.input === 'gantimer', onSelect: () => chooseInput('gantimer') },
                'sep' as const,
                { key: 'gan', label: 'GAN smart cube', onSelect: () => chooseInput('smartcube', 'gan') },
                { key: 'my32', label: 'MoYu V10 AI / MoYu32', onSelect: () => chooseInput('smartcube', 'moyu32') },
                { key: 'my', label: 'MoYu WeiLong AI', onSelect: () => chooseInput('smartcube', 'moyu') },
                { key: 'other', label: 'GiiKER, GoCube, QiYi, HeyKube', onSelect: () => chooseInput('smartcube', 'other') },
              ]
            : []),
        ]}
      />
      <Menu
        label="Phases"
        trigger={<>phases <b>{settings.phases === 1 ? 'off' : settings.phases === 4 ? 'cfop' : settings.phases}</b></>}
        items={[1, 2, 3, 4].map((n) => ({
          key: String(n),
          label: n === 1 ? 'Off' : n === 4 ? '4 (cross, F2L, OLL, PLL)' : `${n} phases`,
          checked: settings.phases === n,
          onSelect: () => setSettings({ phases: n }),
        }))}
      />
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
