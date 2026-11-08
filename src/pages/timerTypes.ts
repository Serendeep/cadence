import type { SessionData } from '../hooks/useSessionData'
import type { DrillMode, Settings } from '../lib/settings'
import type { InputSource, Penalty, TimedMove } from '../lib/types'

export interface TimerSaveInput {
  time: number
  penalty: Penalty
  splits?: number[]
  moves?: TimedMove[]
  rotations?: TimedMove[]
  source: InputSource
}

export interface TimerViewProps {
  data: SessionData
  settings: Settings
  drill: DrillMode | null
  scramble: string | null
  scrambleError: boolean
  onNewScramble: () => void
  onPrevious: () => void
  save: (r: TimerSaveInput) => void
}

