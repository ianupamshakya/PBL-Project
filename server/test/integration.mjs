import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { MongoMemoryServer } from 'mongodb-memory-server'

test('private discovery, mutual acceptance, authorized chat and blocking', { timeout: 120000 }, async t => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  t.after(async () => mongo.stop())
  const port = 43127
  const server = spawn(process.execPath, ['src/index.js'], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      MONGODB_URI: mongo.getUri(),
      JWT_SECRET: 'integration-test-secret-only-at-least-32-characters',
      PORT: String(port),
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverError = ''
  server.stderr.on('data', chunk => { serverError += chunk.toString() })
  t.after(() => server.kill())
  const base = `http://localhost:${port}/api`
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(`${base}/health`); if (response.ok) break } catch {}
    if (attempt === 99) throw new Error(`API did not start: ${serverError}`)
    await delay(100)
  }
  const request = async (path, { method = 'GET', cookie, body } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json()
    return { status: response.status, body: json, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const alice = await request('/auth/register', { method: 'POST', body: { email: 'alice@example.test', password: 'securepass123', tags: ['books', 'music', 'coffee'] } })
  const bob = await request('/auth/register', { method: 'POST', body: { email: 'bob@example.test', password: 'securepass123', tags: ['books', 'nature', 'coffee'] } })
  const charlie = await request('/auth/register', { method: 'POST', body: { email: 'charlie@example.test', password: 'securepass123', tags: ['music', 'gaming', 'art'] } })
  assert.equal(alice.status, 201)
  assert.equal(bob.status, 201)
  assert.equal(charlie.status, 201)
  const discovery = await request('/discover', { cookie: alice.cookie })
  const bobCard = discovery.body.suggestions.find(card => card.id === bob.body.user.id)
  assert.deepEqual(bobCard.sharedTags, ['books', 'coffee'])
  assert.ok(!('alias' in bobCard) && !('email' in bobCard))
  const sent = await request(`/interests/${bob.body.user.id}`, { method: 'POST', cookie: alice.cookie })
  assert.equal(sent.status, 201)
  const pending = await request('/connections', { cookie: bob.cookie })
  assert.equal(pending.body.connections[0].direction, 'incoming')
  assert.ok(!('alias' in pending.body.connections[0].person))
  assert.equal((await request(`/connections/${sent.body.id}/messages`, { cookie: alice.cookie })).status, 404)
  assert.equal((await request(`/connections/${sent.body.id}/messages`, { cookie: charlie.cookie })).status, 404)
  assert.equal((await request(`/connections/${sent.body.id}`, { method: 'PATCH', cookie: bob.cookie, body: { action: 'accept' } })).status, 200)
  const connected = await request('/connections', { cookie: alice.cookie })
  assert.ok(connected.body.connections[0].person.alias)
  assert.ok(!('email' in connected.body.connections[0].person))
  assert.equal((await request(`/connections/${sent.body.id}/messages`, { method: 'POST', cookie: alice.cookie, body: { text: 'A small hello' } })).status, 201)
  const chat = await request(`/connections/${sent.body.id}/messages`, { cookie: bob.cookie })
  assert.equal(chat.body.messages[0].text, 'A small hello')
  assert.equal(chat.body.messages[0].mine, false)
  assert.equal((await request(`/block/${alice.body.user.id}`, { method: 'POST', cookie: bob.cookie })).status, 200)
  assert.equal((await request(`/connections/${sent.body.id}/messages`, { cookie: alice.cookie })).status, 403)
  const seedExit = await new Promise(resolve => {
    const seed = spawn(process.execPath, ['src/seed.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, MONGODB_URI: mongo.getUri(), NODE_ENV: 'development' } })
    seed.on('close', resolve)
  })
  assert.equal(seedExit, 0)
  const afterSeed = await request('/discover', { cookie: charlie.cookie })
  assert.ok(afterSeed.body.suggestions.length >= 5)
})
