import mongoose from 'mongoose'

const { Schema, model } = mongoose

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  alias: { type: String, required: true },
  tags: { type: [String], default: [] },
  blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true })

const connectionSchema = new Schema({
  pairKey: { type: String, required: true, unique: true },
  requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true })
connectionSchema.index({ requester: 1, status: 1 })
connectionSchema.index({ recipient: 1, status: 1 })

const messageSchema = new Schema({
  connection: { type: Schema.Types.ObjectId, ref: 'Connection', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 1000 },
}, { timestamps: true })
messageSchema.index({ connection: 1, createdAt: 1 })

const reportSchema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reported: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true, maxlength: 500 },
}, { timestamps: true })

export const User = model('User', userSchema)
export const Connection = model('Connection', connectionSchema)
export const Message = model('Message', messageSchema)
export const Report = model('Report', reportSchema)
