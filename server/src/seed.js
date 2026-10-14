import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { User, Connection } from './models.js'
import { pairKey } from './logic.js'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })
if (process.env.NODE_ENV === 'production') {
  console.error('Demo data cannot be seeded in production.')
  process.exit(1)
}
if (!process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI in .env first.')
  process.exit(1)
}

const samples = [
  ['Gentle Fern 201', ['books', 'coffee', 'quiet walks', 'poetry']],
  ['Curious Moon 302', ['music', 'art', 'slow mornings', 'stargazing']],
  ['Warm Robin 403', ['books', 'music', 'nature', 'deep talks']],
  ['Soft River 504', ['gaming', 'movies', 'cooking', 'coffee']],
  ['Kind Willow 605', ['plants', 'pets', 'quiet walks', 'journaling']],
]

try {
  await mongoose.connect(process.env.MONGODB_URI)
  const passwordHash = await bcrypt.hash('DemoPass123!', 12)
  const users = []
  for (let index = 0; index < samples.length; index++) {
    const email = `demo${index + 1}@example.test`
    const [alias, tags] = samples[index]
    const user = await User.findOneAndUpdate({ email }, { $setOnInsert: { email, passwordHash, alias, tags } }, { upsert: true, new: true })
    users.push(user)
  }
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4]]) {
    await Connection.updateOne({ pairKey: pairKey(users[a]._id, users[b]._id) }, { $setOnInsert: { requester: users[a]._id, recipient: users[b]._id, status: 'accepted' } }, { upsert: true })
  }
  console.log('Demo accounts are ready: demo1@example.test through demo5@example.test, password DemoPass123!')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
