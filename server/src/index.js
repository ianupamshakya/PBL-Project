import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { randomInt } from 'node:crypto'
import path from 'node:path'
import { User, Connection, Message, Report } from './models.js'
import { normalizeTags, pairKey, recommend, SUGGESTED_TAGS } from './logic.js'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const app = express()
const PORT = Number(process.env.PORT || 4000)
const SECRET = process.env.JWT_SECRET
const isProduction = process.env.NODE_ENV === 'production'
const ORIGIN = process.env.CLIENT_ORIGIN || (isProduction ? `http://localhost:${PORT}` : 'http://localhost:5173')

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: ORIGIN, credentials: true }))
app.use(express.json({ limit: '20kb' }))
app.use(cookieParser())
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }))
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('origin') && req.get('origin') !== ORIGIN) {
    return res.status(403).json({ error: 'Invalid request origin.' })
  }
  next()
})

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const bad = (res, message, status = 400) => res.status(status).json({ error: message })
const validId = id => mongoose.isValidObjectId(id)
const aliasParts = {
  first: ['Quiet', 'Gentle', 'Kind', 'Soft', 'Warm', 'Calm', 'Brave', 'Curious'],
  second: ['Comet', 'Fern', 'Moon', 'River', 'Willow', 'Robin', 'Cloud', 'Sparrow'],
}
const makeAlias = () => `${aliasParts.first[randomInt(aliasParts.first.length)]} ${aliasParts.second[randomInt(aliasParts.second.length)]} ${randomInt(100, 999)}`
const ownUser = user => ({ id: String(user._id), email: user.email, alias: user.alias, tags: user.tags })
const person = user => ({ id: String(user._id), alias: user.alias, tags: user.tags })
const tokenCookie = (res, id) => res.cookie('kinship_session', jwt.sign({ sub: String(id) }, SECRET, { expiresIn: '7d' }), {
  httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/',
})

async function auth(req, res, next) {
  try {
    const raw = req.cookies.kinship_session
    if (!raw) return bad(res, 'Please sign in to continue.', 401)
    const payload = jwt.verify(raw, SECRET)
    const user = await User.findById(payload.sub)
    if (!user) return bad(res, 'Your session has expired. Please sign in again.', 401)
    req.user = user
    next()
  } catch { return bad(res, 'Your session has expired. Please sign in again.', 401) }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))
app.get('/api/tags', (_req, res) => res.json({ tags: SUGGESTED_TAGS }))

app.post('/api/auth/register', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const tags = normalizeTags(req.body.tags)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return bad(res, 'Enter a valid email address.')
  if (password.length < 8 || password.length > 128) return bad(res, 'Use a password with 8 to 128 characters.')
  if (tags.length < 3) return bad(res, 'Choose at least three hashtags.')
  if (await User.exists({ email })) return bad(res, 'An account with this email already exists.', 409)
  const user = await User.create({ email, passwordHash: await bcrypt.hash(password, 12), alias: makeAlias(), tags })
  tokenCookie(res, user._id)
  res.status(201).json({ user: ownUser(user) })
}))

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const user = await User.findOne({ email })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return bad(res, 'Email or password is incorrect.', 401)
  tokenCookie(res, user._id)
  res.json({ user: ownUser(user) })
}))

app.post('/api/auth/logout', (_req, res) => { res.clearCookie('kinship_session', { path: '/' }); res.json({ ok: true }) })
app.get('/api/auth/me', auth, (req, res) => res.json({ user: ownUser(req.user) }))

app.patch('/api/profile', auth, wrap(async (req, res) => {
  const tags = normalizeTags(req.body.tags)
  if (tags.length < 3) return bad(res, 'Choose at least three hashtags.')
  req.user.tags = tags
  await req.user.save()
  res.json({ user: ownUser(req.user) })
}))

app.get('/api/discover', auth, wrap(async (req, res) => {
  const [users, connections] = await Promise.all([
    User.find({}, '_id tags blockedUsers').lean(),
    Connection.find({}, 'requester recipient status').lean(),
  ])
  const blockedByOthers = users.filter(user => user.blockedUsers.some(id => String(id) === String(req.user._id))).map(user => String(user._id))
  const blocked = [...req.user.blockedUsers.map(String), ...blockedByOthers]
  const suggestions = recommend(req.user._id, users, connections.filter(c => c.status === 'accepted'), connections, blocked)
  res.json({ suggestions: suggestions.slice(0, 60) })
}))

app.get('/api/connections', auth, wrap(async (req, res) => {
  const items = await Connection.find({ $or: [{ requester: req.user._id }, { recipient: req.user._id }] })
    .populate('requester', 'alias tags blockedUsers').populate('recipient', 'alias tags blockedUsers').sort({ updatedAt: -1 }).lean()
  const visible = items.filter(item => {
    const other = String(item.requester._id) === String(req.user._id) ? item.recipient : item.requester
    return !req.user.blockedUsers.some(id => String(id) === String(other._id)) && !other.blockedUsers.some(id => String(id) === String(req.user._id))
  })
  res.json({ connections: visible.map(item => {
    const mine = String(item.requester._id) === String(req.user._id)
    const other = mine ? item.recipient : item.requester
    return {
      id: String(item._id), status: item.status, direction: mine ? 'outgoing' : 'incoming',
      person: item.status === 'accepted' ? person(other) : { id: String(other._id), tags: other.tags },
      updatedAt: item.updatedAt,
    }
  }) })
}))

app.post('/api/interests/:userId', auth, wrap(async (req, res) => {
  const id = req.params.userId
  if (!validId(id) || id === String(req.user._id)) return bad(res, 'Choose another person.')
  const target = await User.findById(id)
  if (!target) return bad(res, 'This person is no longer available.', 404)
  if (req.user.blockedUsers.some(x => String(x) === id) || target.blockedUsers.some(x => String(x) === String(req.user._id))) return bad(res, 'This person is unavailable.', 403)
  try {
    const connection = await Connection.create({ pairKey: pairKey(req.user._id, id), requester: req.user._id, recipient: id })
    res.status(201).json({ id: String(connection._id), status: 'pending' })
  } catch (error) {
    if (error.code === 11000) return bad(res, 'An interest or connection already exists.', 409)
    throw error
  }
}))

app.patch('/api/connections/:id', auth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 'Invalid request.')
  if (!['accept', 'decline'].includes(req.body.action)) return bad(res, 'Choose accept or decline.')
  const item = await Connection.findOne({ _id: req.params.id, recipient: req.user._id, status: 'pending' })
  if (!item) return bad(res, 'This request is no longer available.', 404)
  const requester = await User.findById(item.requester)
  if (!requester || req.user.blockedUsers.some(x => String(x) === String(item.requester)) || requester.blockedUsers.some(x => String(x) === String(req.user._id))) return bad(res, 'This request is no longer available.', 404)
  item.status = req.body.action === 'accept' ? 'accepted' : 'declined'
  await item.save()
  res.json({ status: item.status })
}))

async function acceptedConnection(req, res, next) {
  if (!validId(req.params.id)) return bad(res, 'Invalid conversation.')
  const item = await Connection.findOne({ _id: req.params.id, status: 'accepted', $or: [{ requester: req.user._id }, { recipient: req.user._id }] })
  if (!item) return bad(res, 'Conversation not found.', 404)
  const otherId = String(item.requester) === String(req.user._id) ? item.recipient : item.requester
  const other = await User.findById(otherId)
  if (!other || req.user.blockedUsers.some(x => String(x) === String(otherId)) || other.blockedUsers.some(x => String(x) === String(req.user._id))) return bad(res, 'Conversation unavailable.', 403)
  req.connection = item
  req.other = other
  next()
}

app.get('/api/connections/:id/messages', auth, wrap(acceptedConnection), wrap(async (req, res) => {
  const messages = await Message.find({ connection: req.connection._id }).sort({ createdAt: -1 }).limit(100).lean()
  res.json({ person: person(req.other), messages: messages.reverse().map(m => ({ id: String(m._id), mine: String(m.sender) === String(req.user._id), text: m.text, createdAt: m.createdAt })) })
}))

app.post('/api/connections/:id/messages', auth, wrap(acceptedConnection), wrap(async (req, res) => {
  const text = String(req.body.text || '').trim()
  if (!text || text.length > 1000) return bad(res, 'Message must be between 1 and 1000 characters.')
  const message = await Message.create({ connection: req.connection._id, sender: req.user._id, text })
  res.status(201).json({ message: { id: String(message._id), mine: true, text, createdAt: message.createdAt } })
}))

app.post('/api/block/:userId', auth, wrap(async (req, res) => {
  const id = req.params.userId
  if (!validId(id) || id === String(req.user._id)) return bad(res, 'Invalid person.')
  await User.updateOne({ _id: req.user._id }, { $addToSet: { blockedUsers: id } })
  res.json({ ok: true })
}))

app.post('/api/report/:userId', auth, wrap(async (req, res) => {
  const id = req.params.userId
  const reason = String(req.body.reason || '').trim()
  if (!validId(id) || id === String(req.user._id) || !reason || reason.length > 500) return bad(res, 'Add a short reason for your report.')
  await Report.create({ reporter: req.user._id, reported: id, reason })
  res.status(201).json({ ok: true })
}))

if (isProduction) {
  const dist = fileURLToPath(new URL('../../client/dist', import.meta.url))
  app.use(express.static(dist))
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return bad(res, 'Endpoint not found.', 404)
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === 11000) return bad(res, 'This item already exists.', 409)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

if (!process.env.MONGODB_URI || !SECRET || SECRET.length < 32 || (isProduction && SECRET === 'replace-with-a-long-random-secret-at-least-32-characters')) {
  console.error('Set MONGODB_URI and a JWT_SECRET of at least 32 characters in .env.')
  process.exit(1)
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  app.listen(PORT, () => console.log(`Kinship API ready at http://localhost:${PORT}`))
} catch (error) {
  console.error('MongoDB connection failed:', error.message)
  process.exit(1)
}
