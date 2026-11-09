import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { expect, test, vi } from 'vitest'
import { addSolve, createSession, db, deleteSolve, ensureSession, mergeSession, onSolveDeleted, removeEmptyMains, sessionSolves, updateSolve } from './db'
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

test('merging moves every solve with its uid into the target and removes the source', async () => {
  await db.open()
  try {
    const target = await createSession('Main', '333')
    const source = await createSession('OH practice', '333')
    const other = await createSession('Other', '333')
    for (let i = 0; i < 3; i++) await db.solves.add({ sessionId: source, time: 10000 + i, penalty: 'ok', scramble: 'R', event: '333', date: i, updated: 1 })
    await addSolve({ sessionId: target, time: 9000, penalty: 'ok', scramble: 'U', event: '333', date: 10 })
    await addSolve({ sessionId: other, time: 8000, penalty: 'ok', scramble: 'F', event: '333', date: 11 })
    const before = await db.solves.where('sessionId').equals(source).toArray()
    const sourceUid = (await db.sessions.get(source))!.uid!
    const startedAt = Date.now()

    await mergeSession(source, target)

    const moved = await db.solves.where('uid').anyOf(before.map((s) => s.uid!)).toArray()
    expect(moved).toHaveLength(3)
    expect(moved.every((s) => s.sessionId === target && s.updated! >= startedAt)).toBe(true)
    expect(await db.solves.where('sessionId').equals(target).count()).toBe(4)
    expect(await db.solves.where('sessionId').equals(other).count()).toBe(1)
    expect(await db.sessions.get(source)).toBeUndefined()
    expect(await db.tombstones.get(sourceUid)).toMatchObject({ kind: 'session' })
    expect(await db.tombstones.where('uid').anyOf(before.map((s) => s.uid!)).count()).toBe(0)
    await expect(mergeSession(target, target)).rejects.toThrow()
  } finally {
    await db.delete()
  }
})

test('empty Main cleanup removes extra empty Mains but keeps one with solves, the open one and other names', async () => {
  await db.open()
  await db.sessions.clear()
  await db.solves.clear()
  const a = await createSession('Main', '333')
  const b = await createSession('Main', '333')
  const c = await createSession('Main', '333')
  const withSolves = await createSession('Main', '333')
  const other = await createSession('cstimer 1', '333')
  await addSolve({ sessionId: withSolves, time: 12000, penalty: 'ok', scramble: 'R', event: '333', date: 1 })
  expect(await removeEmptyMains(a)).toBe(2)
  const left = (await db.sessions.toArray()).map((s) => s.id)
  expect(left.sort()).toEqual([a, withSolves, other].sort())
  expect(left).not.toContain(b)
  expect(left).not.toContain(c)
  // deletions sync to other devices
  expect((await db.tombstones.toArray()).filter((t) => t.kind === 'session')).toHaveLength(2)
  await db.delete()
})
