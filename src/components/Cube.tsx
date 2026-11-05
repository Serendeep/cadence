import { useEffect, useMemo, useRef } from 'react'
import { faceGrid, type CubeState, type Face } from '../lib/cube'
import { twistyPuzzle } from '../lib/events'
import { angleBetween, IDENTITY, slerp, type Quat } from '../lib/orientation'

const STICKER: Record<Face, string> = {
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

export interface TwistyHandle {
  addMove: (m: string) => void
  reset: (setup: string) => void
  /** Turns the whole 3D cube to match the physical cube (screen axes) */
  setOrientation: (q: Quat) => void
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

// time constant of the orientation glide: higher is smoother but lags the real cube more
const ORIENTATION_SMOOTHING_MS = 60
// below this the cube is drawn where it should be; about a tenth of a degree
const SETTLED_RAD = 0.002

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
        puzzle: twistyPuzzle(event) as never,
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
      // Readings arrive in uneven Bluetooth bursts with sensor noise; each frame the cube glides a time-scaled share
      // of the way to the newest reading, which hides both, and the loop stops once it has caught up
      let target: Quat | null = null
      let shown: Quat = IDENTITY
      let frame = 0
      let last = 0
      const puzzle = player.experimentalCurrentThreeJSPuzzleObject()
      const step = async (now: number) => {
        frame = 0
        if (!target || disposed) return
        const dt = last ? Math.min(now - last, 100) : 16
        last = now
        shown = slerp(shown, target, 1 - Math.exp(-dt / ORIENTATION_SMOOTHING_MS))
        const [obj, vantages] = await Promise.all([puzzle, player.experimentalCurrentVantages()])
        obj.quaternion.set(shown.x, shown.y, shown.z, shown.w)
        for (const v of vantages) void v.render()
        if (angleBetween(shown, target) > SETTLED_RAD) frame = requestAnimationFrame((t) => void step(t))
        else last = 0
      }
      readyRef.current?.({
        setOrientation: (q) => {
          target = q
          if (!frame) frame = requestAnimationFrame((t) => void step(t))
        },
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
