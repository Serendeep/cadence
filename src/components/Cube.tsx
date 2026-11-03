import { useEffect, useMemo, useRef } from 'react'
import { faceGrid, type CubeState, type Face } from '../lib/cube'

export const STICKER: Record<Face, string> = {
  U: '#f5f5f5', D: '#f4d23a', F: '#2fa84f', B: '#2f6fd6', R: '#d8343a', L: '#f08a24',
}

const NET_POS: Record<Face, [number, number]> = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] }

/** Flat net of a 3x3 state, white top and green front. */
export function CubeNet({ state, size = 12 }: { state: CubeState; size?: number }) {
  const cells = useMemo(
    () =>
      (Object.keys(NET_POS) as Face[]).flatMap((f) => {
        const [r, c] = NET_POS[f]
        return faceGrid(state, f).map((k, i) => ({ key: `${f}${i}`, row: r + 1 + Math.floor(i / 3), col: c + 1 + (i % 3), color: STICKER[k] }))
      }),
    [state],
  )
  return (
    <div className="net" style={{ ['--s' as string]: `${size}px` }} role="img" aria-label="Scrambled cube, white on top, green in front">
      {cells.map((c) => (
        <i key={c.key} style={{ gridRow: c.row, gridColumn: c.col, background: c.color }} />
      ))}
    </div>
  )
}

const TWISTY_PUZZLE: Record<string, string> = {
  '222': '2x2x2', '333': '3x3x3', '333oh': '3x3x3', '333bf': '3x3x3', '333fm': '3x3x3', '444': '4x4x4', '555': '5x5x5',
  '666': '6x6x6', '777': '7x7x7', pyram: 'pyraminx', skewb: 'skewb', minx: 'megaminx', sq1: 'square1', clock: 'clock',
  '444bf': '4x4x4', '555bf': '5x5x5',
}

export interface TwistyHandle {
  addMove: (m: string) => void
  reset: (setup: string) => void
}

interface TwistyProps {
  event: string
  setup?: string
  alg?: string
  visualization?: '2D' | '3D'
  controls?: boolean
  onReady?: (h: TwistyHandle) => void
  label: string
}

/** cubing.js TwistyPlayer, loaded lazily (it pulls in three.js). */
export function Twisty({ event, setup = '', alg = '', visualization = '2D', controls = false, onReady, label }: TwistyProps) {
  const host = useRef<HTMLDivElement>(null)
  const readyRef = useRef(onReady)
  useEffect(() => {
    readyRef.current = onReady
  })

  useEffect(() => {
    let disposed = false
    let el: HTMLElement | null = null
    void import('cubing/twisty').then(({ TwistyPlayer }) => {
      if (disposed || !host.current) return
      const player = new TwistyPlayer({
        puzzle: (TWISTY_PUZZLE[event] ?? '3x3x3') as never,
        experimentalSetupAlg: setup,
        alg,
        visualization,
        controlPanel: controls ? 'bottom-row' : 'none',
        background: 'none',
        hintFacelets: 'none',
        backView: 'none',
        tempoScale: 2.5,
      })
      el = player
      host.current.replaceChildren(player)
      readyRef.current?.({
        addMove: (m) => player.experimentalAddMove(m, { cancel: false }),
        reset: (s) => {
          player.experimentalSetupAlg = s
          player.alg = ''
        },
      })
    })
    return () => {
      disposed = true
      el?.remove()
    }
  }, [event, setup, alg, visualization, controls])

  return <div ref={host} className="twisty-host" role="img" aria-label={label} />
}

export const twistySupports = (event: string) => event in TWISTY_PUZZLE
