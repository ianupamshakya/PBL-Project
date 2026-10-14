import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MongoMemoryServer } from 'mongodb-memory-server'

const root = fileURLToPath(new URL('../', import.meta.url))
const python = path.join(root, '.venv', 'bin', 'python')

test('Python API works with real MongoDB and keeps discovery private', { timeout: 120000 }, async t => {
  const binaryDir = path.join(root, '.local', 'mongodb-binaries')
  await mkdir(binaryDir, { recursive: true })
  process.env.MONGOMS_DOWNLOAD_DIR ||= binaryDir
  const mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  t.after(async () => mongo.stop())
  const port = 43127
  const env = {
    ...process.env,
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: 'integration-test-secret-only-at-least-32-characters',
    CLIENT_ORIGIN: 'http://localhost:5173',
    APP_ENV: 'development',
  }
  const api = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(port)], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let errors = ''
  api.stderr.on('data', chunk => { errors += chunk.toString() })
  t.after(() => api.kill('SIGTERM'))
  const base = `http://127.0.0.1:${port}/api`
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${base}/health`)
      if (response.ok && (await response.json()).database === 'connected') break
    } catch {}
    if (attempt === 99) throw new Error(`Python API did not start: ${errors}`)
    await delay(100)
  }
  const request = async (route, { method = 'GET', cookie, body } = {}) => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const alice = await request('/auth/register', { method: 'POST', body: { email: 'alice@example.test', password: 'securepass123', tags: ['books', 'music', 'coffee'] } })
  const bob = await request('/auth/register', { method: 'POST', body: { email: 'bob@example.test', password: 'securepass123', tags: ['books', 'nature', 'coffee'] } })
  const charlie = await request('/auth/register', { method: 'POST', body: { email: 'charlie@example.test', password: 'securepass123', tags: ['music', 'gaming', 'art'] } })
  assert.equal(alice.status, 201, JSON.stringify(alice.body))
  assert.equal(bob.status, 201, JSON.stringify(bob.body))
  assert.equal(charlie.status, 201, JSON.stringify(charlie.body))

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
  assert.equal((await request(`/connections/${sent.body.id}/messages`, { method: 'POST', cookie: alice.cookie, body: { text: 'Hello' } })).status, 201)
  const chat = await request(`/connections/${sent.body.id}/messages`, { cookie: bob.cookie })
  assert.equal(chat.body.messages[0].text, 'Hello')
  assert.equal(chat.body.messages[0].mine, false)
  assert.equal((await request(`/block/${alice.body.user.id}`, { method: 'POST', cookie: bob.cookie })).status, 200)
  assert.equal((await request(`/connections/${sent.body.id}/messages`, { cookie: alice.cookie })).status, 403)
  const seedCode = await new Promise((resolve, reject) => {
    const seed = spawn(python, ['-m', 'backend.seed'], { cwd: root, env, stdio: 'ignore' })
    seed.on('error', reject)
    seed.on('close', resolve)
  })
  assert.equal(seedCode, 0)
  const demoLogin = await request('/auth/login', { method: 'POST', body: { email: 'demo1@example.test', password: 'DemoPass123!' } })
  assert.equal(demoLogin.status, 200)
})
