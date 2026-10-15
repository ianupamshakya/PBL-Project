import { MongoMemoryServer } from 'mongodb-memory-server'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const python = process.platform === 'win32'
  ? path.join(root, '.venv', 'Scripts', 'python.exe')
  : path.join(root, '.venv', 'bin', 'python')
if (!existsSync(python)) {
  console.error('Create .venv and install requirements-dev.txt first. See README.md.')
  process.exit(1)
}

const binaryDir = path.join(root, '.local', 'mongodb-binaries')
await mkdir(binaryDir, { recursive: true })
process.env.MONGOMS_DOWNLOAD_DIR ||= binaryDir
let mongo
const children = []
let stopping = false

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  children.forEach(child => child.kill('SIGTERM'))
  await mongo?.stop()
  process.exit(code)
}
process.on('SIGINT', () => { void stop() })
process.on('SIGTERM', () => { void stop() })

try {
  console.log('Starting temporary MongoDB for the demo…')
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  const env = {
    ...process.env,
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: randomBytes(48).toString('hex'),
    CLIENT_ORIGIN: 'http://localhost:5173',
    PORT: '4000',
    APP_ENV: 'development',
  }
  const seed = spawn(python, ['-m', 'backend.seed'], { cwd: root, env, stdio: 'inherit' })
  const seedCode = await new Promise(resolve => seed.on('close', resolve))
  if (seedCode !== 0) throw new Error('Could not create demo accounts.')
  const api = spawn(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '4000'], { cwd: root, env, stdio: 'inherit' })
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const web = spawn(npm, ['run', 'dev', '-w', 'client'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
  children.push(api, web)
  for (const child of children) child.on('exit', code => { if (!stopping) void stop(code || 1) })
  console.log('Demo starting at http://localhost:5173')
} catch (error) {
  console.error('Demo setup failed:', error.message)
  await stop(1)
}
