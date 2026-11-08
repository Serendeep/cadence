import type { TimerViewProps } from '../pages/timerTypes'
import { toast } from '../lib/toast'
import { BackIcon, CopyIcon } from './icons'

type ScrambleLineProps = Pick<TimerViewProps, 'scramble' | 'scrambleError' | 'onNewScramble' | 'onPrevious'> & {
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

