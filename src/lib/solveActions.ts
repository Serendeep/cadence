import { addSolve, deleteSolve } from './db'
import { formatMs, solveValue } from './time'
import { toast } from './toast'
import type { Solve } from './types'

/** Deletes a solve and offers Undo, which restores it with the same id across synced devices. */
export function removeSolveWithUndo(s: Solve) {
  if (s.id == null) return
  void deleteSolve(s.id).then(() => {
    toast(`Deleted ${formatMs(solveValue(s))}`, {
      label: 'Undo',
      run: () => {
        const { id: _id, ...rest } = s
        void addSolve(rest)
      },
    })
  })
}
