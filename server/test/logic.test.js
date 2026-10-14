import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTags, pairKey, recommend } from '../src/logic.js'

test('normalizes hashtags, removes duplicates and rejects invalid text', () => {
  assert.deepEqual(normalizeTags(['#Books', ' books ', 'quiet walks', 'x', 'a@b', 'MUSIC']), ['books', 'quiet walks', 'music'])
})

test('pair key is identical in either direction', () => {
  assert.equal(pairKey('b', 'a'), pairKey('a', 'b'))
})

test('recommendations exclude self, existing connections and blocked people, then rank mutual friends', () => {
  const users = [
    { _id: 'me', tags: ['books', 'music'] },
    { _id: 'friend', tags: ['music'] },
    { _id: 'mutual', tags: ['books'] },
    { _id: 'shared', tags: ['books', 'music'] },
    { _id: 'pending', tags: ['books', 'music'] },
    { _id: 'blocked', tags: ['books', 'music'] },
  ]
  const accepted = [{ requester: 'me', recipient: 'friend' }, { requester: 'friend', recipient: 'mutual' }]
  const all = [...accepted, { requester: 'me', recipient: 'pending' }]
  const result = recommend('me', users, accepted, all, ['blocked'])
  assert.deepEqual(result.map(x => x.id), ['mutual', 'shared'])
  assert.equal(result[0].mutualCount, 1)
  assert.deepEqual(result[1].sharedTags, ['books', 'music'])
  assert.ok(result.every(x => !('email' in x) && !('alias' in x)))
})
