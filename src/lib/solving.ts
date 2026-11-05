let solving = false
let waiting: (() => void)[] = []

/** The timer screens report whether a solve (or its inspection) is under way. */
export function setSolving(active: boolean): void {
  solving = active
  if (active) return
  const ready = waiting
  waiting = []
  ready.forEach((run) => run())
}

/** Runs `run` now, or once the current solve ends, so nothing pops up mid-solve. */
export function whenNotSolving(run: () => void): void {
  if (solving) waiting = [...waiting, run]
  else run()
}
