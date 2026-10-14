import { MongoMemoryServer } from 'mongodb-memory-server'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const serverDir = fileURLToPath(new URL('../', import.meta.url))
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
  console.log('Starting a temporary local MongoDB for the demo…')
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  const env = {
    ...process.env,
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: randomBytes(48).toString('hex'),
    CLIENT_ORIGIN: 'http://localhost:5173',
    PORT: '4000',
    NODE_ENV: 'development',
  }
  const seed = spawn(process.execPath, ['src/seed.js'], { cwd: serverDir, env, stdio: 'inherit' })
  const seedCode = await new Promise(resolve => seed.on('close', resolve))
  if (seedCode !== 0) throw new Error('Could not create demo accounts.')
  console.log('Demo ready. Open http://localhost:5173')
  const api = spawn(process.execPath, ['src/index.js'], { cwd: serverDir, env, stdio: 'inherit' })
  const web = spawn('npm', ['run', 'dev', '-w', 'client'], { cwd: root, env, stdio: 'inherit' })
  children.push(api, web)
  for (const child of children) child.on('exit', code => { if (!stopping) void stop(code || 1) })
} catch (error) {
  console.error('Demo setup failed:', error.message)
  await stop(1)
}
