import { detectSplits } from './cfop'
import { db } from './db'
import { scrambledState } from './smartSolve'

// set once the repair has run on this device
const DONE_KEY = 'cadence:splits-repaired'

/**
 * Smart cube solves recorded before the cross fix had the cross ending with F2L.
 * Their moves are stored, so the phases can be worked out again; returns how many solves changed.
 */
export async function repairSmartCubeSplits(): Promise<number> {
  try {
    if (localStorage.getItem(DONE_KEY)) return 0
  } catch {
    return 0
  }
  const solves = await db.solves.filter((s) => s.source === 'smartcube' && !!s.moves?.length).toArray()
  let fixed = 0
  await db.transaction('rw', db.solves, async () => {
    for (const s of solves) {
      // null when the stored moves do not solve the stored scramble, e.g. the cube was out of step; leave those alone
      const found = s.id != null ? detectSplits(s.method ?? 'cfop', scrambledState(s.scramble), s.moves!) : null
      if (!found) continue
      const splits = found.map((v) => Math.min(v, s.time))
      if (splits.join() === s.splits?.join()) continue
      await db.solves.update(s.id!, { splits })
      fixed++
    }
  })
  localStorage.setItem(DONE_KEY, '1')
  return fixed
}
