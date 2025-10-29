import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import { get, run } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const COOKIE_NAME = 'auth'

export const withCookies = cookieParser()

export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
}

export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production'
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase()
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined
  const secure = isProd || sameSite === 'none'
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: sameSite === 'none' ? 'none' : (sameSite === 'strict' ? 'strict' : 'lax'),
    secure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
    domain: cookieDomain,
  })
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export async function authOptional(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) { req.user = null; return next() }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = await get(`SELECT id, email, name, theme FROM users WHERE id = ?`, [payload.uid])
    req.user = user || null
  } catch {
    req.user = null
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  next()
}
