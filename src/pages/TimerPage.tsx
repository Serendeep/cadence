import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionData } from '../hooks/useSessionData'
import { addSolve } from '../lib/db'
import { useDevices } from '../lib/deviceStore'
import { eventById } from '../lib/events'
import { drillScramble } from '../lib/drills'
import { nextScramble } from '../lib/scramble'
import { useSettings } from '../lib/settings'
import { toast } from '../lib/toast'
import type { DrillKind } from '../lib/types'
import { FocusView } from './FocusView'
import { LabView } from './LabView'
import type { TimerSaveInput, TimerViewProps } from './timerTypes'

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
    (r: TimerSaveInput) => {
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

  const shared: TimerViewProps = {
    data, settings, drill, scramble: scramble?.event === event && scramble.drill === drillKind ? scramble.text : null, scrambleError, onNewScramble: load, onPrevious: previous, save,
  }
  return lab ? <LabView {...shared} /> : <FocusView {...shared} onFocusChange={onFocusChange} />
}
