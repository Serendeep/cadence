import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { expect, test, vi } from 'vitest'
import { addSolve, db, deleteSolve, ensureSession, onSolveDeleted, sessionSolves, updateSolve } from './db'
import type { Solve } from './types'

test('deletion notifies views after committing and supports undo and edits', async () => {
  const sessionId = await ensureSession()
  const firstId = await addSolve({ sessionId, time: 12000, penalty: 'ok', scramble: 'R U', event: '333', date: 1 })
  const secondId = await addSolve({ sessionId, time: 15000, penalty: 'ok', scramble: 'U R', event: '333', date: 2 })
  let current: Solve[] = []
  const notified = vi.fn()
  const unsubscribe = onSolveDeleted(notified)
  const subscription = liveQuery(() => sessionSolves(sessionId)).subscribe((solves) => { current = solves })
  try {
    await vi.waitFor(() => expect(current).toHaveLength(2))
    const previous = current
    const { id: _id, ...deleted } = current[1]
    await deleteSolve(secondId)
    expect(notified).toHaveBeenCalledExactlyOnceWith(secondId)
    expect(await db.solves.get(secondId)).toBeUndefined()
    await vi.waitFor(() => expect(current.map((s) => s.id)).toEqual([firstId]))
    expect(previous).toHaveLength(2)
    expect(await db.tombstones.get(deleted.uid!)).toMatchObject({ kind: 'solve' })
    await addSolve(deleted)
    await vi.waitFor(() => expect(current.map((s) => s.uid)).toContain(deleted.uid))
    await updateSolve(firstId, { penalty: '+2' })
    await vi.waitFor(() => expect(current[0].penalty).toBe('+2'))
    expect(previous[0].penalty).toBe('ok')
    const failure = vi.spyOn(db.solves, 'delete').mockRejectedValueOnce(new Error('Storage unavailable'))
    try {
      await expect(deleteSolve(firstId)).rejects.toThrow('Storage unavailable')
      expect(await db.solves.get(firstId)).toBeDefined()
      expect(await db.tombstones.get(previous[0].uid!)).toBeUndefined()
      expect(notified).toHaveBeenCalledTimes(1)
    } finally {
      failure.mockRestore()
    }
  } finally {
    subscription.unsubscribe()
    unsubscribe()
    await db.delete()
  }
})
