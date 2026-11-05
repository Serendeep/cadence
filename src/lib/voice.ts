export type Voice = 'off' | 'male' | 'female'
export const VOICES: readonly Voice[] = ['off', 'male', 'female']

/** WCA judges call out 8 and 12 seconds of inspection; recordings from csTimer (GPL). */
const INSPECTION_CALLS = [8000, 12000] as const
// a call missed by more than this (tab in background) is stale; stay quiet instead of talking late
const LATE_MS = 1000

const clips = new Map<string, HTMLAudioElement>()

function clip(voice: Exclude<Voice, 'off'>, mark: number): HTMLAudioElement {
  const src = `${import.meta.env.BASE_URL}voice/${voice}-${mark / 1000}.mp3`
  let a = clips.get(src)
  if (!a) {
    a = new Audio(src)
    a.preload = 'auto'
    clips.set(src, a)
  }
  return a
}

export function playCall(voice: Voice, mark: number): void {
  if (voice === 'off') return
  const a = clip(voice, mark)
  a.currentTime = 0
  a.play().catch((e: unknown) => console.warn('Inspection call could not play', e))
}

export function preloadCalls(voice: Voice): void {
  if (voice !== 'off') INSPECTION_CALLS.forEach((m) => clip(voice, m))
}

/** Call every frame during inspection; each mark plays once per inspection, identified by its start time. */
export function inspectionCaller(play: (voice: Voice, mark: number) => void = playCall): (voice: Voice, inspStart: number, elapsed: number) => void {
  let current: number | null = null
  const done = new Set<number>()
  return (voice, inspStart, elapsed) => {
    if (inspStart !== current) {
      current = inspStart
      done.clear()
    }
    for (const m of INSPECTION_CALLS) {
      if (elapsed < m || done.has(m)) continue
      done.add(m)
      if (elapsed < m + LATE_MS) play(voice, m)
    }
  }
}
