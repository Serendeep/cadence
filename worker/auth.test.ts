import { expect, test } from 'vitest'
import { randomHex, signToken, verifyToken } from './auth'
import { parseSyncRequest } from './sync'
import { parseProfile } from './wca'

const SECRET = 'test-secret'

test('a signed token verifies and names its user and token id', async () => {
  const tokenId = randomHex(16)
  const token = await signToken(SECRET, '12345', tokenId)
  expect(await verifyToken(SECRET, token)).toEqual({ userId: '12345', tokenId })
})

test('a token signed with another secret, or edited to another user, is rejected', async () => {
  const tokenId = randomHex(16)
  const token = await signToken(SECRET, '12345', tokenId)
  expect(await verifyToken('other-secret', token)).toBeNull()
  expect(await verifyToken(SECRET, token.replace('12345', '12346'))).toBeNull()
  expect(await verifyToken(SECRET, `${token}.x`)).toBeNull()
  expect(await verifyToken(SECRET, 'not a token')).toBeNull()
})

test('sync requests are checked field by field', () => {
  const solve = { kind: 'solve', uid: 'a1b2-c3', updated: 1700000000000, deleted: false, data: { time: 9000 } }
  expect(parseSyncRequest({ since: 0, changes: [solve] })?.changes).toHaveLength(1)
  expect(parseSyncRequest({ since: 0, changes: [{ ...solve, deleted: true }] })?.changes[0].data).toBeUndefined()
  expect(parseSyncRequest({ since: -1, changes: [] })).toBeNull()
  expect(parseSyncRequest({ since: 0, changes: [{ ...solve, kind: 'user' }] })).toBeNull()
  expect(parseSyncRequest({ since: 0, changes: [{ ...solve, uid: '../x' }] })).toBeNull()
  expect(parseSyncRequest({ since: 0, changes: [{ ...solve, data: undefined }] })).toBeNull()
  expect(parseSyncRequest({ since: 0, changes: [{ ...solve, data: { big: 'x'.repeat(70000) } }] })).toBeNull()
  expect(parseSyncRequest({ since: 0, changes: Array(501).fill(solve) })).toBeNull()
})

test('the WCA profile is read from /me, with or without a competitor id', () => {
  expect(parseProfile({ me: { id: 7, name: 'Ana', wca_id: '2019ANAA01', avatar: { thumb_url: 'https://x/a.jpg' } } })).toEqual({
    id: 7, wcaId: '2019ANAA01', name: 'Ana', avatar: 'https://x/a.jpg',
  })
  expect(parseProfile({ me: { id: 8, name: 'Bo', wca_id: null } })).toEqual({ id: 8, wcaId: null, name: 'Bo', avatar: null })
  expect(parseProfile({ error: 'nope' })).toBeNull()
})
