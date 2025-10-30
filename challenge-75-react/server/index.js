import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { db, ensureSchema, toState, upsertDay, resetAll, importState, UPLOADS_DIR, all, run, get } from './lib/db.js'
import { withCookies, authOptional, requireAuth, hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie, decodeToken } from './lib/auth.js'
import http from 'http'
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 4000
const app = express()

app.use(withCookies)
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

// Serve built React client if available (production single process)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLIENT_DIST = path.join(__dirname, '../client/dist')
if (fs.existsSync(CLIENT_DIST) && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST))
}

// Attach optional auth to all requests
app.use(authOptional)

// Landing page to avoid "Cannot GET /"
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(`<!doctype html><html><head><meta charset="utf-8"/><title>Challenge 75 API</title></head><body>
  <h1>Challenge 75 API</h1>
  <p>Server is running.</p>
  <ul>
    <li><a href="/api/health">/api/health</a> – health check</li>
    <li><a href="/api/tasks/types">/api/tasks/types</a> – task types</li>
  </ul>
  <p>React client runs separately on <code>http://localhost:5173</code> (after <code>npm run dev</code> in client).</p>
  </body></html>`)
})

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }))

// -------- Auth --------
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name || null, theme: req.user.theme || 'pink' } : null })
})
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' })
  const exists = await get(`SELECT id FROM users WHERE email = ?`, [String(email).toLowerCase()])
  if (exists) return res.status(409).json({ error: 'email_taken' })
  const id = crypto.randomUUID()
  const hash = await hashPassword(password)
  const now = new Date().toISOString()
  await run(`INSERT INTO users(id,email,password,name,created_at) VALUES(?,?,?,?,?)`, [id, String(email).toLowerCase(), hash, name || null, now])
  const token = signToken({ id, email: String(email).toLowerCase() })
  setAuthCookie(res, token)
  res.json({ user: { id, email: String(email).toLowerCase(), name: name || null, theme: 'pink' } })
})
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = await get(`SELECT id, email, password, name, theme FROM users WHERE email = ?`, [String(email||'').toLowerCase()])
  if (!user) return res.status(401).json({ error: 'invalid_credentials' })
  const ok = await verifyPassword(password || '', user.password)
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })
  const token = signToken({ id: user.id, email: user.email })
  setAuthCookie(res, token)
  res.json({ user: { id: user.id, email: user.email, name: user.name || null, theme: user.theme || 'pink' } })
})
app.post('/api/auth/logout', (req, res) => { clearAuthCookie(res); res.json({ ok: true }) })
app.put('/api/user/theme', requireAuth, async (req, res) => {
  const theme = String(req.body?.theme || '')
  await run(`UPDATE users SET theme = ? WHERE id = ?`, [theme, req.user.id])
  res.json({ ok: true })
})

// Create share link
app.post('/api/share/create', requireAuth, async (req, res) => {
  const include = req.body?.include_images ? 1 : 0
  const days = Number(req.body?.days || 0)
  const token = crypto.randomUUID()
  const now = new Date()
  const expires = days > 0 ? new Date(now.getTime() + days*24*60*60*1000) : null
  await run(`INSERT INTO share_links(token, user_id, include_images, created_at, expires_at) VALUES(?,?,?,?,?)`, [
    token, req.user.id, include, now.toISOString(), expires ? expires.toISOString() : null
  ])
  res.json({ token })
})

// Public share payload
app.get('/api/share/:token', async (req, res) => {
  const link = await get(`SELECT token, user_id, include_images, expires_at FROM share_links WHERE token = ?`, [req.params.token])
  if (!link) return res.status(404).json({ error: 'not_found' })
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return res.status(410).json({ error: 'expired' })
  const user = await get(`SELECT id, name, email, theme, avatar_path FROM users WHERE id = ?`, [link.user_id])
  if (!user) return res.status(404).json({ error: 'user_not_found' })
  // Build state for this user (read‑only)
  const base = await toState()
  const uid = user.id
  const personalTypes = await all(`SELECT key, title, emoji, position FROM user_task_types WHERE user_id = ? ORDER BY position ASC`, [uid])
  if (personalTypes.length) {
    const merged = [...personalTypes]
    for (const g of base.taskTypes||[]) if (!personalTypes.find(p => p.key === g.key)) merged.push(g)
    base.taskTypes = merged
  }
  const ut = await all(`SELECT day, key, done FROM user_tasks WHERE user_id = ?`, [uid])
  const ud = await all(`SELECT day, note, weight FROM user_days WHERE user_id = ?`, [uid])
  const ua = link.include_images ? await all(`SELECT id, day, name, type, size FROM user_attachments WHERE user_id = ? ORDER BY created_at ASC`, [uid]) : []
  const perDayTasks = {}; for (const r of ut) { perDayTasks[r.day] ||= {}; perDayTasks[r.day][r.key] = !!r.done }
  const perDayDetails = Object.fromEntries(ud.map(r => [r.day, r]))
  const perDayAtts = {}; for (const a of ua) { (perDayAtts[a.day] ||= []).push({ id: a.id, name: a.name, type: a.type, size: a.size }) }
  for (const d of base.days) {
    const m = perDayTasks[d.day] || {}
    for (const tt of (base.taskTypes||[])) if (!(tt.key in d.tasks)) d.tasks[tt.key] = false
    for (const k of Object.keys(d.tasks)) if (m[k] !== undefined) d.tasks[k] = m[k]
    const det = perDayDetails[d.day]; if (det) { d.note = det.note || ''; d.weight = det.weight ?? null }
    d.attachments = perDayAtts[d.day] || []
  }
  const goals = await all(`SELECT id, title, due, done, notes, created_at FROM user_goals WHERE user_id = ? ORDER BY created_at DESC`, [uid])
  res.json({
    user: { id: user.id, name: user.name || null, theme: user.theme || 'pink', avatar: user.avatar_path ? `/api/share/${req.params.token}/avatar` : null },
    include_images: !!link.include_images,
    days: base.days,
    goals,
    taskTypes: base.taskTypes
  })
})

app.get('/api/share/:token/avatar', async (req, res) => {
  const link = await get(`SELECT user_id, expires_at FROM share_links WHERE token = ?`, [req.params.token])
  if (!link) return res.status(404).end()
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return res.status(410).end()
  const row = await get(`SELECT avatar_path FROM users WHERE id = ?`, [link.user_id])
  if (!row?.avatar_path || !fs.existsSync(row.avatar_path)) return res.status(404).end()
  const type = 'image/' + (path.extname(row.avatar_path).slice(1) || 'jpeg')
  res.setHeader('Content-Type', type)
  fs.createReadStream(row.avatar_path).pipe(res)
})

app.get('/api/share/:token/attachment/:id', async (req, res) => {
  const link = await get(`SELECT user_id, include_images, expires_at FROM share_links WHERE token = ?`, [req.params.token])
  if (!link || !link.include_images) return res.status(404).end()
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return res.status(410).end()
  const row = await get(`SELECT path, name, type FROM user_attachments WHERE id = ? AND user_id = ?`, [req.params.id, link.user_id])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  fs.createReadStream(row.path).pipe(res)
})

// ---- Users search and inbox (in‑app sharing) ----
app.get('/api/users/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  if (!q) return res.json([])
  const rows = await all(`SELECT id, email, name FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? LIMIT 20`, [`%${q}%`, `%${q}%`])
  res.json(rows.filter(u => u.id !== req.user.id))
})

app.get('/api/inbox', requireAuth, async (req, res) => {
  const rows = await all(`SELECT id, from_user_id, type, payload, created_at, read FROM inbox WHERE to_user_id = ? ORDER BY created_at DESC LIMIT 100`, [req.user.id])
  res.json(rows)
})

app.post('/api/inbox/:id/read', requireAuth, async (req, res) => {
  await run(`UPDATE inbox SET read = 1 WHERE id = ? AND to_user_id = ?`, [req.params.id, req.user.id])
  res.json({ ok: true })
})

// User avatar by id (for friends lists)
app.get('/api/user/:id/avatar', requireAuth, async (req, res) => {
  const row = await get(`SELECT avatar_path FROM users WHERE id = ?`, [req.params.id])
  if (!row?.avatar_path || !fs.existsSync(row.avatar_path)) return res.status(404).end()
  const type = 'image/' + (path.extname(row.avatar_path).slice(1) || 'jpeg')
  res.setHeader('Content-Type', type)
  fs.createReadStream(row.avatar_path).pipe(res)
})

// Plain message send (inbox)
app.post('/api/messages/send', requireAuth, async (req, res) => {
  const { to_user_id, message } = req.body || {}
  if (!to_user_id || !message) return res.status(400).json({ error: 'bad_payload' })
  const id = crypto.randomUUID()
  const payload = JSON.stringify({ message })
  await run(`INSERT INTO inbox(id, to_user_id, from_user_id, type, payload, created_at, read) VALUES(?,?,?,?,?, ?, 0)`, [
    id, to_user_id, req.user.id, 'message', payload, new Date().toISOString()
  ])
  res.json({ ok: true })
})

// Friends system
app.get('/api/friends', requireAuth, async (req, res) => {
  const uid = req.user.id
  const a = await all(`SELECT f.id, u.id as user_id, u.email, u.name FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'accepted'`, [uid])
  const b = await all(`SELECT f.id, u.id as user_id, u.email, u.name FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'accepted'`, [uid])
  res.json([...a, ...b])
})

app.get('/api/friends/requests', requireAuth, async (req, res) => {
  const incoming = await all(`SELECT f.id, f.user_id as from_user_id, u.email, u.name, f.created_at FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [req.user.id])
  const outgoing = await all(`SELECT f.id, f.friend_id as to_user_id, u.email, u.name, f.created_at FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [req.user.id])
  res.json({ incoming, outgoing })
})

app.post('/api/friends/request', requireAuth, async (req, res) => {
  const to = String(req.body?.to_user_id || '')
  if (!to || to === req.user.id) return res.status(400).json({ error: 'bad_payload' })
  // If there's a reverse pending, accept it
  const reverse = await get(`SELECT id FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'`, [to, req.user.id])
  const now = new Date().toISOString()
  if (reverse) {
    await run(`UPDATE friends SET status = 'accepted', updated_at = ? WHERE id = ?`, [now, reverse.id])
    return res.json({ ok: true, accepted: true })
  }
  // Avoid duplicates
  const exists = await get(`SELECT id FROM friends WHERE user_id = ? AND friend_id = ?`, [req.user.id, to])
  if (exists) return res.json({ ok: true })
  const id = crypto.randomUUID()
  await run(`INSERT INTO friends(id, user_id, friend_id, status, created_at, updated_at) VALUES(?,?,?,?,?,?)`, [id, req.user.id, to, 'pending', now, now])
  res.json({ ok: true })
})

app.post('/api/friends/:id/accept', requireAuth, async (req, res) => {
  const row = await get(`SELECT id FROM friends WHERE id = ? AND friend_id = ? AND status = 'pending'`, [req.params.id, req.user.id])
  if (!row) return res.status(404).json({ error: 'not_found' })
  await run(`UPDATE friends SET status = 'accepted', updated_at = ? WHERE id = ?`, [new Date().toISOString(), req.params.id])
  res.json({ ok: true })
})

app.delete('/api/friends/:id', requireAuth, async (req, res) => {
  const row = await get(`SELECT id FROM friends WHERE id = ? AND (user_id = ? OR friend_id = ?)`, [req.params.id, req.user.id, req.user.id])
  if (!row) return res.status(404).json({ error: 'not_found' })
  await run(`DELETE FROM friends WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
})

app.post('/api/share/send', requireAuth, async (req, res) => {
  const { to_user_id, token, message } = req.body || {}
  if (!to_user_id || !token) return res.status(400).json({ error: 'bad_payload' })
  const link = await get(`SELECT token FROM share_links WHERE token = ? AND user_id = ?`, [token, req.user.id])
  if (!link) return res.status(404).json({ error: 'share_not_found' })
  const id = crypto.randomUUID()
  const payload = JSON.stringify({ token, message: message || '' })
  await run(`INSERT INTO inbox(id, to_user_id, from_user_id, type, payload, created_at, read) VALUES(?,?,?,?,?, ?, 0)`, [
    id, to_user_id, req.user.id, 'share', payload, new Date().toISOString()
  ])
  res.json({ ok: true })
})

// Avatar upload and serve
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const base = path.join(UPLOADS_DIR, `u-${req.user.id}`, 'avatar')
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    cb(null, base)
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, Date.now() + '-' + safe)
  }
})
const uploadAvatar = multer({ storage: avatarStorage })

app.post('/api/user/avatar', requireAuth, uploadAvatar.single('file'), async (req, res) => {
  const p = req.file?.path
  if (!p) return res.status(400).json({ error: 'no_file' })
  await run(`UPDATE users SET avatar_path = ? WHERE id = ?`, [p, req.user.id])
  res.json({ ok: true })
})

app.get('/api/user/avatar/me', requireAuth, async (req, res) => {
  const row = await get(`SELECT avatar_path FROM users WHERE id = ?`, [req.user.id])
  if (!row?.avatar_path || !fs.existsSync(row.avatar_path)) return res.status(404).end()
  const type = 'image/' + (path.extname(row.avatar_path).slice(1) || 'jpeg')
  res.setHeader('Content-Type', type)
  fs.createReadStream(row.avatar_path).pipe(res)
})

// Forgot/reset password
app.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase()
  const user = await get(`SELECT id FROM users WHERE email = ?`, [email])
  if (user) {
    const token = crypto.randomUUID()
    const now = new Date()
    const expires = new Date(now.getTime() + 60*60*1000) // 1 hour
    await run(`INSERT INTO password_resets(token, user_id, created_at, expires_at, used) VALUES(?,?,?,?,0)`, [
      token, user.id, now.toISOString(), expires.toISOString()
    ])
    console.log('Password reset token for', email, token)
    // In dev we return the token to simplify testing
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ok: true, token })
    }
  }
  res.json({ ok: true })
})

app.post('/api/auth/reset', async (req, res) => {
  const { token, password } = req.body || {}
  if (!token || !password) return res.status(400).json({ error: 'bad_payload' })
  const row = await get(`SELECT token, user_id, expires_at, used FROM password_resets WHERE token = ?`, [token])
  if (!row || row.used) return res.status(400).json({ error: 'invalid_or_used' })
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'expired' })
  const hash = await hashPassword(password)
  await run(`UPDATE users SET password = ? WHERE id = ?`, [hash, row.user_id])
  await run(`UPDATE password_resets SET used = 1 WHERE token = ?`, [token])
  const user = await get(`SELECT id, email, name, theme FROM users WHERE id = ?`, [row.user_id])
  const jwt = signToken({ id: user.id, email: user.email })
  setAuthCookie(res, jwt)
  res.json({ ok: true, user })
})

// State
async function buildStateForUser(userId) {
  const state = await toState()
  if (!userId) return state
  // Merge personal task types
  const personalTypes = await all(`SELECT key, title, emoji, position FROM user_task_types WHERE user_id = ? ORDER BY position ASC`, [userId])
  if (personalTypes.length) {
    const existing = state.taskTypes || []
    const merged = [...personalTypes]
    for (const g of existing) if (!personalTypes.find(p => p.key === g.key)) merged.push(g)
    state.taskTypes = merged
  }
  const ut = await all(`SELECT day, key, done FROM user_tasks WHERE user_id = ?`, [userId])
  const ud = await all(`SELECT day, note, weight FROM user_days WHERE user_id = ?`, [userId])
  const ua = await all(`SELECT id, day, name, type, size FROM user_attachments WHERE user_id = ? ORDER BY created_at ASC`, [userId])
  const uct = await all(`SELECT id, day, title, done, position, created_at FROM user_day_custom_tasks WHERE user_id = ? ORDER BY COALESCE(position, 999999), created_at ASC`, [userId])
  const g = await all(`SELECT id, title, due, done, notes, created_at FROM user_goals WHERE user_id = ? ORDER BY created_at DESC`, [userId])
  const perDayTasks = {}
  for (const r of ut) { perDayTasks[r.day] ||= {}; perDayTasks[r.day][r.key] = !!r.done }
  const perDayDetails = Object.fromEntries(ud.map(r => [r.day, r]))
  const perDayAtts = {}
  for (const a of ua) { (perDayAtts[a.day] ||= []).push({ id: a.id, name: a.name, type: a.type, size: a.size }) }
  const perDayCustom = {}
  for (const c of uct) { (perDayCustom[c.day] ||= []).push({ id: c.id, title: c.title, done: !!c.done, position: c.position, created_at: c.created_at }) }
  for (const d of state.days) {
    const m = perDayTasks[d.day] || {}
    for (const tt of (state.taskTypes||[])) if (!(tt.key in d.tasks)) d.tasks[tt.key] = false
    for (const k of Object.keys(d.tasks)) if (m[k] !== undefined) d.tasks[k] = m[k]
    const det = perDayDetails[d.day]; if (det) { d.note = det.note || ''; d.weight = det.weight ?? null }
    if (perDayAtts[d.day]) d.attachments = perDayAtts[d.day]
    d.customTasks = perDayCustom[d.day] || []
  }
  state.goals = g
  return state
}

app.get('/api/state', async (req, res) => {
  try {
    const state = await buildStateForUser(req.user?.id)
    res.json(state)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed_to_load' })
  }
})

// Update tasks for day
app.put('/api/day/:day/tasks', async (req, res) => {
  const day = Number(req.params.day)
  if (!Number.isInteger(day) || day < 1 || day > 75) return res.status(400).json({ error: 'invalid_day' })
  const tasks = req.body || {}
  try {
    if (req.user) {
      for (const [k, v] of Object.entries(tasks)) {
        await run(`INSERT OR REPLACE INTO user_tasks(user_id,day,key,done) VALUES(?,?,?,?)`, [req.user.id, day, k, v ? 1 : 0])
      }
    } else {
      await upsertDay(day, tasks, null)
    }
    const state = await buildStateForUser(req.user?.id)
    res.json(state)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed_to_update' })
  }
})

// Update details for day (note, weight)
app.put('/api/day/:day/details', async (req, res) => {
  const day = Number(req.params.day)
  if (!Number.isInteger(day) || day < 1 || day > 75) return res.status(400).json({ error: 'invalid_day' })
  const { note, weight } = req.body || {}
  try {
    if (req.user) {
      await run(`INSERT OR IGNORE INTO user_days(user_id, day) VALUES(?, ?)`, [req.user.id, day])
      await run(`UPDATE user_days SET note = COALESCE(?, note), weight = ? WHERE user_id = ? AND day = ?`, [
        typeof note === 'string' ? note : null,
        (weight === null || weight === undefined || weight === '') ? null : Number(weight),
        req.user.id,
        day
      ])
    } else {
      await upsertDay(day, null, { note, weight })
    }
    const state = await buildStateForUser(req.user?.id)
    res.json(state)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed_to_update' })
  }
})

// ----- Per-day custom tasks (per user) -----
app.get('/api/day/:day/custom-tasks', requireAuth, async (req, res) => {
  const day = Number(req.params.day)
  const rows = await all(`SELECT id, title, done, position, created_at FROM user_day_custom_tasks WHERE user_id = ? AND day = ? ORDER BY COALESCE(position, 999999), created_at ASC`, [req.user.id, day])
  res.json(rows)
})

app.post('/api/day/:day/custom-tasks', requireAuth, async (req, res) => {
  const day = Number(req.params.day)
  const title = String(req.body?.title || '').trim()
  if (!title) return res.status(400).json({ error: 'title_required' })
  const id = crypto.randomUUID()
  const posRow = await get(`SELECT COALESCE(MAX(position),0) as p FROM user_day_custom_tasks WHERE user_id = ? AND day = ?`, [req.user.id, day])
  const position = (posRow?.p || 0) + 1
  const created = new Date().toISOString()
  await run(`INSERT INTO user_day_custom_tasks(id, user_id, day, title, done, position, created_at) VALUES(?,?,?,?,?,?,?)`, [id, req.user.id, day, title, 0, position, created])
  res.json({ id, title, done: 0, position, created_at: created })
})

app.put('/api/day/:day/custom-tasks/:id', requireAuth, async (req, res) => {
  const day = Number(req.params.day)
  const { id } = req.params
  const { title, done, position } = req.body || {}
  await run(`UPDATE user_day_custom_tasks SET title = COALESCE(?, title), done = COALESCE(?, done), position = COALESCE(?, position) WHERE id = ? AND user_id = ? AND day = ?`, [
    title ?? null,
    typeof done === 'boolean' ? (done ? 1 : 0) : null,
    position ?? null,
    id, req.user.id, day
  ])
  res.json({ ok: true })
})

app.delete('/api/day/:day/custom-tasks/:id', requireAuth, async (req, res) => {
  const day = Number(req.params.day)
  await run(`DELETE FROM user_day_custom_tasks WHERE id = ? AND user_id = ? AND day = ?`, [req.params.id, req.user.id, day])
  res.json({ ok: true })
})

// Goals
app.get('/api/goals', async (req, res) => {
  if (req.user) {
    const rows = await all(`SELECT id, title, due, done, notes, created_at FROM user_goals WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id])
    res.json(rows)
  } else {
    const goals = await all(`SELECT id, title, due, done, notes, created_at FROM goals ORDER BY created_at DESC`)
    res.json(goals)
  }
})

app.post('/api/goals', async (req, res) => {
  const { title, due } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title_required' })
  const id = crypto.randomUUID()
  const created = new Date().toISOString()
  if (req.user) {
    await run(`INSERT INTO user_goals(id, user_id, title, due, done, notes, created_at) VALUES(?,?,?,?,?,?,?)`, [id, req.user.id, title, due ?? null, 0, '', created])
    res.json({ id, title, due: due ?? null, done: 0, notes: '', created_at: created })
  } else {
    await run(`INSERT INTO goals(id, title, due, done, notes, created_at) VALUES(?,?,?,?,?,?)`, [id, title, due ?? null, 0, '', created])
    res.json({ id, title, due: due ?? null, done: 0, notes: '', created_at: created })
  }
})

app.put('/api/goals/:id', async (req, res) => {
  const { id } = req.params
  const { title, due, done, notes } = req.body || {}
  if (req.user) {
    const row = await get(`SELECT id FROM user_goals WHERE id = ? AND user_id = ?`, [id, req.user.id])
    if (!row) return res.status(404).json({ error: 'not_found' })
    await run(`UPDATE user_goals SET title = COALESCE(?, title), due = ?, done = COALESCE(?, done), notes = COALESCE(?, notes) WHERE id = ? AND user_id = ?`, [
      title ?? null,
      due ?? null,
      typeof done === 'boolean' ? (done ? 1 : 0) : null,
      notes ?? null,
      id, req.user.id
    ])
    res.json({ ok: true })
  } else {
    const row = await get(`SELECT id FROM goals WHERE id = ?`, [id])
    if (!row) return res.status(404).json({ error: 'not_found' })
    await run(`UPDATE goals SET title = COALESCE(?, title), due = ?, done = COALESCE(?, done), notes = COALESCE(?, notes) WHERE id = ?`, [
      title ?? null,
      due ?? null,
      typeof done === 'boolean' ? (done ? 1 : 0) : null,
      notes ?? null,
      id
    ])
    res.json({ ok: true })
  }
})

app.delete('/api/goals/:id', async (req, res) => {
  if (req.user) await run(`DELETE FROM user_goals WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id])
  else await run(`DELETE FROM goals WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
})

// Attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const day = Number(req.params.day)
    const dir = path.join(UPLOADS_DIR, `day-${day}`)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, unique + '-' + safe)
  }
})
const upload = multer({ storage })

app.get('/api/day/:day/attachments', async (req, res) => {
  const day = Number(req.params.day)
  if (req.user) {
    const rows = await all(`SELECT id, name, type, size FROM user_attachments WHERE user_id = ? AND day = ? ORDER BY created_at ASC`, [req.user.id, day])
    res.json(rows)
  } else {
    const rows = await all(`SELECT id, name, type, size FROM attachments WHERE day = ? ORDER BY created_at ASC`, [day])
    res.json(rows)
  }
})

app.post('/api/day/:day/attachments', upload.array('files'), async (req, res) => {
  const day = Number(req.params.day)
  const files = req.files || []
  const now = new Date().toISOString()
  if (req.user) {
    for (const f of files) {
      const id = crypto.randomUUID()
      await run(`INSERT INTO user_attachments(id, user_id, day, name, type, size, path, created_at) VALUES(?,?,?,?,?,?,?,?)`, [
        id, req.user.id, day, f.originalname, f.mimetype, f.size, f.path, now
      ])
    }
    const rows = await all(`SELECT id, name, type, size FROM user_attachments WHERE user_id = ? AND day = ? ORDER BY created_at ASC`, [req.user.id, day])
    res.json(rows)
  } else {
    for (const f of files) {
      const id = crypto.randomUUID()
      await run(`INSERT INTO attachments(id, day, name, type, size, path, created_at) VALUES(?,?,?,?,?,?,?)`, [
        id, day, f.originalname, f.mimetype, f.size, f.path, now
      ])
    }
    const rows = await all(`SELECT id, name, type, size FROM attachments WHERE day = ? ORDER BY created_at ASC`, [day])
    res.json(rows)
  }
})

app.get('/api/attachments/:id/download', async (req, res) => {
  let row = null
  if (req.user) row = await get(`SELECT name, type, path FROM user_attachments WHERE id = ?`, [req.params.id])
  if (!row) row = await get(`SELECT name, type, path FROM attachments WHERE id = ?`, [req.params.id])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`)
  fs.createReadStream(row.path).pipe(res)
})

app.delete('/api/attachments/:id', async (req, res) => {
  let row = null
  if (req.user) row = await get(`SELECT path FROM user_attachments WHERE id = ?`, [req.params.id])
  if (!row) row = await get(`SELECT path FROM attachments WHERE id = ?`, [req.params.id])
  if (row && fs.existsSync(row.path)) { try { fs.unlinkSync(row.path) } catch {} }
  await run(`DELETE FROM user_attachments WHERE id = ?`, [req.params.id])
  await run(`DELETE FROM attachments WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
})

// Inline view for images
app.get('/api/attachments/:id/view', async (req, res) => {
  let row = null
  if (req.user) row = await get(`SELECT name, type, path FROM user_attachments WHERE id = ?`, [req.params.id])
  if (!row) row = await get(`SELECT name, type, path FROM attachments WHERE id = ?`, [req.params.id])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  // Let browser decide to render inline
  fs.createReadStream(row.path).pipe(res)
})

// Reset / Import
app.post('/api/reset', async (_req, res) => {
  await resetAll()
  const state = await toState()
  res.json(state)
})

app.post('/api/import', async (req, res) => {
  try {
    await importState(req.body)
    const state = await toState()
    res.json(state)
  } catch (e) {
    res.status(400).json({ error: 'invalid_import' })
  }
})

// Task types CRUD
app.get('/api/tasks/types', async (req, res) => {
  const globals = await all(`SELECT key, title, emoji, position FROM task_types ORDER BY position ASC`)
  if (!req.user) return res.json(globals)
  const personal = await all(`SELECT key, title, emoji, position FROM user_task_types WHERE user_id = ? ORDER BY position ASC`, [req.user.id])
  const merged = [...personal]
  for (const g of globals) if (!personal.find(p => p.key === g.key)) merged.push(g)
  res.json(merged)
})

app.post('/api/tasks/types', async (req, res) => {
  const { title, emoji } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title_required' })
  // make key slug
  const base = (title || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'task'
  let candidate = base, i = 1
  if (req.user) {
    while (await get(`SELECT key FROM user_task_types WHERE user_id = ? AND key = ?`, [req.user.id, candidate])) candidate = `${base}-${i++}`
    const posRow = await get(`SELECT COALESCE(MAX(position),0) as p FROM user_task_types WHERE user_id = ?`, [req.user.id])
    const position = (posRow?.p || 0) + 1
    await run(`INSERT INTO user_task_types(user_id,key,title,emoji,position) VALUES(?,?,?,?,?)`, [req.user.id, candidate, title, emoji ?? null, position])
    return res.json({ key: candidate, title, emoji: emoji ?? null, position })
  } else {
    while (await get(`SELECT key FROM task_types WHERE key = ?`, [candidate])) candidate = `${base}-${i++}`
    const posRow = await get(`SELECT COALESCE(MAX(position),0) as p FROM task_types`)
    const position = (posRow?.p || 0) + 1
    await run(`INSERT INTO task_types(key,title,emoji,position) VALUES(?,?,?,?)`, [candidate, title, emoji ?? null, position])
    // seed for all days
    for (let d = 1; d <= 75; d++) await run(`INSERT OR IGNORE INTO tasks(day,key,done) VALUES(?,?,0)`, [d, candidate])
    return res.json({ key: candidate, title, emoji: emoji ?? null, position })
  }
})

app.put('/api/tasks/types/:key', async (req, res) => {
  const { key } = req.params
  const { title, emoji, position } = req.body || {}
  if (req.user) {
    const exists = await get(`SELECT key FROM user_task_types WHERE user_id = ? AND key = ?`, [req.user.id, key])
    if (!exists) return res.status(404).json({ error: 'not_found' })
    if (position !== undefined) await run(`UPDATE user_task_types SET position = ? WHERE user_id = ? AND key = ?`, [Number(position), req.user.id, key])
    await run(`UPDATE user_task_types SET title = COALESCE(?, title), emoji = COALESCE(?, emoji) WHERE user_id = ? AND key = ?`, [title ?? null, emoji ?? null, req.user.id, key])
    return res.json({ ok: true })
  } else {
    const exists = await get(`SELECT key FROM task_types WHERE key = ?`, [key])
    if (!exists) return res.status(404).json({ error: 'not_found' })
    if (position !== undefined) await run(`UPDATE task_types SET position = ? WHERE key = ?`, [Number(position), key])
    await run(`UPDATE task_types SET title = COALESCE(?, title), emoji = COALESCE(?, emoji) WHERE key = ?`, [title ?? null, emoji ?? null, key])
    return res.json({ ok: true })
  }
})

app.delete('/api/tasks/types/:key', async (req, res) => {
  const { key } = req.params
  if (req.user) {
    await run(`DELETE FROM user_task_types WHERE user_id = ? AND key = ?`, [req.user.id, key])
    await run(`DELETE FROM user_tasks WHERE user_id = ? AND key = ?`, [req.user.id, key])
    return res.json({ ok: true })
  } else {
    await run(`DELETE FROM task_types WHERE key = ?`, [key])
    await run(`DELETE FROM tasks WHERE key = ?`, [key])
    return res.json({ ok: true })
  }
})

// ----------------- Ascetics (Аскеза) -----------------
// Create ascetic
app.post('/api/ascetics', async (req, res) => {
  const { title, reward, duration, startDate } = req.body || {}
  const d = Number(duration)
  if (!title || !Number.isInteger(d) || d < 1 || d > 365) return res.status(400).json({ error: 'bad_payload' })
  const id = crypto.randomUUID()
  const created = new Date().toISOString()
  await run(`INSERT INTO ascetics(id, user_id, title, reward, duration, start_date, created_at) VALUES(?,?,?,?,?,?,?)`, [
    id, req.user?.id || null, title, reward ?? null, d, startDate ?? null, created
  ])
  for (let i=1;i<=d;i++) await run(`INSERT OR IGNORE INTO ascetic_days(ascetic_id, day, done, note) VALUES(?,?,0,'')`, [id, i])
  res.json({ id, title, reward: reward??null, duration: d, start_date: startDate??null, created_at: created })
})

// List ascetics
app.get('/api/ascetics', async (req, res) => {
  const rows = req.user
    ? await all(`SELECT id, title, reward, duration, start_date, created_at FROM ascetics WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id])
    : []
  res.json(rows)
})

// Get ascetic with days
app.get('/api/ascetics/:id', async (req, res) => {
  const id = req.params.id
  const asc = req.user
    ? await get(`SELECT id, title, reward, duration, start_date, created_at FROM ascetics WHERE id = ? AND user_id = ?`, [id, req.user.id])
    : null
  if (!asc) return res.status(404).json({ error: 'not_found' })
  const days = await all(`SELECT day, done, note FROM ascetic_days WHERE ascetic_id = ? ORDER BY day ASC`, [id])
  const atts = await all(`SELECT id, day, name, type, size FROM ascetic_attachments WHERE ascetic_id = ? ORDER BY created_at ASC`, [id])
  res.json({ ...asc, days, attachments: atts })
})

// Update a day (done/note)
app.put('/api/ascetics/:id/day/:day', async (req, res) => {
  const id = req.params.id
  const day = Number(req.params.day)
  const { done, note } = req.body || {}
  const owner = req.user ? await get(`SELECT id FROM ascetics WHERE id = ? AND user_id = ?`, [id, req.user.id]) : null
  if (!owner) return res.status(401).json({ error: 'unauthorized' })
  await run(`UPDATE ascetic_days SET done = COALESCE(?, done), note = COALESCE(?, note) WHERE ascetic_id = ? AND day = ?`, [
    typeof done === 'boolean' ? (done ? 1 : 0) : null,
    typeof note === 'string' ? note : null,
    id, day
  ])
  res.json({ ok: true })
})

// Delete ascetic
app.delete('/api/ascetics/:id', async (req, res) => {
  const id = req.params.id
  const files = await all(`SELECT path FROM ascetic_attachments WHERE ascetic_id = ?`, [id])
  for (const f of files) { if (f.path && fs.existsSync(f.path)) { try { fs.unlinkSync(f.path) } catch {} } }
  await run(`DELETE FROM ascetic_attachments WHERE ascetic_id = ?`, [id])
  await run(`DELETE FROM ascetic_days WHERE ascetic_id = ?`, [id])
  await run(`DELETE FROM ascetics WHERE id = ?`, [id])
  res.json({ ok: true })
})

// Ascetic attachments
const ascStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.params.id
    const dir = path.join(UPLOADS_DIR, `ascetic-${id}`)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, unique + '-' + safe)
  }
})
const ascUpload = multer({ storage: ascStorage })

app.get('/api/ascetics/:id/attachments', async (req, res) => {
  const ok = req.user ? await get(`SELECT id FROM ascetics WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]) : null
  if (!ok) return res.status(401).json({ error: 'unauthorized' })
  const rows = await all(`SELECT id, day, name, type, size FROM ascetic_attachments WHERE ascetic_id = ? ORDER BY created_at ASC`, [req.params.id])
  res.json(rows)
})

app.post('/api/ascetics/:id/attachments', ascUpload.array('files'), async (req, res) => {
  const ok = req.user ? await get(`SELECT id FROM ascetics WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]) : null
  if (!ok) return res.status(401).json({ error: 'unauthorized' })
  const id = req.params.id
  const day = req.query.day ? Number(req.query.day) : null
  const now = new Date().toISOString()
  for (const f of (req.files||[])) {
    const aid = crypto.randomUUID()
    await run(`INSERT INTO ascetic_attachments(id, ascetic_id, day, name, type, size, path, created_at) VALUES(?,?,?,?,?,?,?,?)`, [
      aid, id, day, f.originalname, f.mimetype, f.size, f.path, now
    ])
  }
  const rows = await all(`SELECT id, day, name, type, size FROM ascetic_attachments WHERE ascetic_id = ? ORDER BY created_at ASC`, [id])
  res.json(rows)
})

app.get('/api/ascetics/attachments/:attId/view', async (req, res) => {
  const row = await get(`SELECT name, type, path FROM ascetic_attachments WHERE id = ?`, [req.params.attId])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  fs.createReadStream(row.path).pipe(res)
})

app.get('/api/ascetics/attachments/:attId/download', async (req, res) => {
  const row = await get(`SELECT name, type, path FROM ascetic_attachments WHERE id = ?`, [req.params.attId])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`)
  fs.createReadStream(row.path).pipe(res)
})

app.delete('/api/ascetics/attachments/:attId', async (req, res) => {
  const row = await get(`SELECT path FROM ascetic_attachments WHERE id = ?`, [req.params.attId])
  if (row && fs.existsSync(row.path)) { try { fs.unlinkSync(row.path) } catch {} }
  await run(`DELETE FROM ascetic_attachments WHERE id = ?`, [req.params.attId])
  res.json({ ok: true })
})

// ---- Users search and inbox (in‑app sharing) ----
app.get('/api/users/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  if (!q) return res.json([])
  const rows = await all(`SELECT id, email, name FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? LIMIT 20`, [`%${q}%`, `%${q}%`])
  res.json(rows.filter(u => u.id !== req.user.id))
})

app.get('/api/inbox', requireAuth, async (req, res) => {
  const rows = await all(`SELECT id, from_user_id, type, payload, created_at, read FROM inbox WHERE to_user_id = ? ORDER BY created_at DESC LIMIT 100`, [req.user.id])
  res.json(rows)
})

app.post('/api/inbox/:id/read', requireAuth, async (req, res) => {
  await run(`UPDATE inbox SET read = 1 WHERE id = ? AND to_user_id = ?`, [req.params.id, req.user.id])
  res.json({ ok: true })
})

app.post('/api/share/send', requireAuth, async (req, res) => {
  const { to_user_id, token, message } = req.body || {}
  if (!to_user_id || !token) return res.status(400).json({ error: 'bad_payload' })
  const link = await get(`SELECT token FROM share_links WHERE token = ? AND user_id = ?`, [token, req.user.id])
  if (!link) return res.status(404).json({ error: 'share_not_found' })
  const id = crypto.randomUUID()
  const payload = JSON.stringify({ token, message: message || '' })
  await run(`INSERT INTO inbox(id, to_user_id, from_user_id, type, payload, created_at, read) VALUES(?,?,?,?,?, ?, 0)`, [
    id, to_user_id, req.user.id, 'share', payload, new Date().toISOString()
  ])
  res.json({ ok: true })
})

// Plain message send (inbox)
app.post('/api/messages/send', requireAuth, async (req, res) => {
  const { to_user_id, message } = req.body || {}
  if (!to_user_id || !message) return res.status(400).json({ error: 'bad_payload' })
  const id = crypto.randomUUID()
  const payload = JSON.stringify({ message })
  await run(`INSERT INTO inbox(id, to_user_id, from_user_id, type, payload, created_at, read) VALUES(?,?,?,?,?, ?, 0)`, [
    id, to_user_id, req.user.id, 'message', payload, new Date().toISOString()
  ])
  res.json({ ok: true })
})

// User avatar by id (for friends lists)
app.get('/api/user/:id/avatar', requireAuth, async (req, res) => {
  const row = await get(`SELECT avatar_path FROM users WHERE id = ?`, [req.params.id])
  if (!row?.avatar_path || !fs.existsSync(row.avatar_path)) return res.status(404).end()
  const type = 'image/' + (path.extname(row.avatar_path).slice(1) || 'jpeg')
  res.setHeader('Content-Type', type)
  fs.createReadStream(row.avatar_path).pipe(res)
})

// Friends system
app.get('/api/friends', requireAuth, async (req, res) => {
  const uid = req.user.id
  const a = await all(`SELECT f.id, u.id as user_id, u.email, u.name FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'accepted'`, [uid])
  const b = await all(`SELECT f.id, u.id as user_id, u.email, u.name FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'accepted'`, [uid])
  res.json([...a, ...b])
})

app.get('/api/friends/requests', requireAuth, async (req, res) => {
  const incoming = await all(`SELECT f.id, f.user_id as from_user_id, u.email, u.name, f.created_at FROM friends f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [req.user.id])
  const outgoing = await all(`SELECT f.id, f.friend_id as to_user_id, u.email, u.name, f.created_at FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending' ORDER BY f.created_at DESC`, [req.user.id])
  res.json({ incoming, outgoing })
})

app.post('/api/friends/request', requireAuth, async (req, res) => {
  const to = String(req.body?.to_user_id || '')
  if (!to || to === req.user.id) return res.status(400).json({ error: 'bad_payload' })
  const reverse = await get(`SELECT id FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'`, [to, req.user.id])
  const now = new Date().toISOString()
  if (reverse) {
    await run(`UPDATE friends SET status = 'accepted', updated_at = ? WHERE id = ?`, [now, reverse.id])
    return res.json({ ok: true, accepted: true })
  }
  const exists = await get(`SELECT id FROM friends WHERE user_id = ? AND friend_id = ?`, [req.user.id, to])
  if (exists) return res.json({ ok: true })
  const id = crypto.randomUUID()
  await run(`INSERT INTO friends(id, user_id, friend_id, status, created_at, updated_at) VALUES(?,?,?,?,?,?)`, [id, req.user.id, to, 'pending', now, now])
  res.json({ ok: true })
})

app.post('/api/friends/:id/accept', requireAuth, async (req, res) => {
  const row = await get(`SELECT id FROM friends WHERE id = ? AND friend_id = ? AND status = 'pending'`, [req.params.id, req.user.id])
  if (!row) return res.status(404).json({ error: 'not_found' })
  await run(`UPDATE friends SET status = 'accepted', updated_at = ? WHERE id = ?`, [new Date().toISOString(), req.params.id])
  res.json({ ok: true })
})

app.delete('/api/friends/:id', requireAuth, async (req, res) => {
  const row = await get(`SELECT id FROM friends WHERE id = ? AND (user_id = ? OR friend_id = ?)`, [req.params.id, req.user.id, req.user.id])
  if (!row) return res.status(404).json({ error: 'not_found' })
  await run(`DELETE FROM friends WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
})

// Online presence (shared with WebSocket section below)
// Defined near server creation; here we only use it
app.get('/api/friends/online', requireAuth, async (req, res) => {
  res.json(Array.from(online.keys()))
})

// Chat endpoints
function chatKey(a,b){ return [String(a), String(b)].sort().join('|') }
app.get('/api/chat/unread', requireAuth, async (req, res) => {
  const rows = await all(`SELECT from_user_id as user_id, COUNT(*) as cnt FROM chat_messages WHERE to_user_id = ? AND read_at IS NULL GROUP BY from_user_id`, [req.user.id])
  res.json(rows)
})
app.get('/api/chat/:peerId', requireAuth, async (req, res) => {
  const peer = String(req.params.peerId)
  const k = chatKey(req.user.id, peer)
  const after = req.query.after ? new Date(String(req.query.after)) : null
  const lim = Math.min(Number(req.query.limit || 50), 200)
  const rows = await all(`SELECT id, from_user_id, to_user_id, text, reply_to, created_at, read_at FROM chat_messages WHERE chat_key = ? ${after? 'AND created_at > ?' : ''} ORDER BY created_at ASC LIMIT ?`, after ? [k, after.toISOString(), lim] : [k, lim])
  // hydrate attachments
  for (const m of rows) {
    const atts = await all(`SELECT a.id, a.name, a.type, a.size FROM chat_message_attachments ma JOIN chat_attachments a ON a.id = ma.attachment_id WHERE ma.message_id = ?`, [m.id])
    if (atts.length) m.attachments = atts
  }
  res.json(rows)
})
app.post('/api/chat/:peerId/send', requireAuth, async (req, res) => {
  const peer = String(req.params.peerId)
  const text = String(req.body?.text || '').trim()
  const reply_to = req.body?.reply_to || null
  if (!text) return res.status(400).json({ error: 'empty' })
  const id = crypto.randomUUID()
  const created = new Date().toISOString()
  const k = chatKey(req.user.id, peer)
  await run(`INSERT INTO chat_messages(id, chat_key, from_user_id, to_user_id, text, reply_to, created_at) VALUES(?,?,?,?,?,?,?)`, [id, k, req.user.id, peer, text, reply_to, created])
  // Push via WS if online
  const set = online.get(peer)
  if (set) {
    const payload = JSON.stringify({ type:'chat', from: req.user.id, to: peer, id, text, reply_to, created_at: created })
    for (const s of set) { try { s.send(payload) } catch {} }
  }
  res.json({ id, created_at: created })
})
app.post('/api/chat/:peerId/read', requireAuth, async (req, res) => {
  const peer = String(req.params.peerId)
  const upto = req.body?.upto
  const now = new Date().toISOString()
  if (!upto) return res.status(400).json({ error: 'bad_payload' })
  if (/^[0-9a-fA-F-]{36}$/.test(upto)) {
    const row = await get(`SELECT created_at FROM chat_messages WHERE id = ? AND to_user_id = ?`, [upto, req.user.id])
    if (row) await run(`UPDATE chat_messages SET read_at = ? WHERE to_user_id = ? AND from_user_id = ? AND created_at <= ? AND read_at IS NULL`, [now, req.user.id, peer, row.created_at])
  } else {
    await run(`UPDATE chat_messages SET read_at = ? WHERE to_user_id = ? AND from_user_id = ? AND created_at <= ? AND read_at IS NULL`, [now, req.user.id, peer, String(upto)])
  }
  const set = online.get(peer)
  if (set) {
    const payload = JSON.stringify({ type:'read', from: req.user.id, to: peer, upto })
    for (const s of set) { try { s.send(payload) } catch {} }
  }
  res.json({ ok: true })
})

// Upload chat attachments alongside a message
const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const base = path.join(UPLOADS_DIR, `u-${req.user.id}`, 'chat')
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    cb(null, base)
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, unique + '-' + safe)
  }
})
const chatUpload = multer({ storage: chatStorage })

app.post('/api/chat/:peerId/send-with-attachments', requireAuth, chatUpload.array('files'), async (req, res) => {
  const peer = String(req.params.peerId)
  const text = String(req.body?.text || '')
  if (!text && (!req.files || req.files.length===0)) return res.status(400).json({ error: 'empty' })
  const id = crypto.randomUUID()
  const created = new Date().toISOString()
  const k = chatKey(req.user.id, peer)
  await run(`INSERT INTO chat_messages(id, chat_key, from_user_id, to_user_id, text, created_at) VALUES(?,?,?,?,?,?)`, [id, k, req.user.id, peer, text, created])
  for (const f of (req.files||[])) {
    const aid = crypto.randomUUID()
    await run(`INSERT INTO chat_attachments(id, path, name, type, size, from_user_id, to_user_id, created_at) VALUES(?,?,?,?,?,?,?,?)`, [
      aid, f.path, f.originalname, f.mimetype, f.size, req.user.id, peer, created
    ])
    await run(`INSERT INTO chat_message_attachments(message_id, attachment_id) VALUES(?,?)`, [id, aid])
  }
  const set = online.get(peer)
  if (set) {
    const payload = JSON.stringify({ type:'chat', from: req.user.id, to: peer, id, text, created_at: created, has_attachments: (req.files||[]).length>0 })
    for (const s of set) { try { s.send(payload) } catch {} }
  }
  res.json({ id, created_at: created })
})

app.get('/api/chat/attachments/:id/view', requireAuth, async (req, res) => {
  const row = await get(`SELECT path, name, type FROM chat_attachments WHERE id = ?`, [req.params.id])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  fs.createReadStream(row.path).pipe(res)
})

// SPA fallback (only when static is enabled)
if (fs.existsSync(CLIENT_DIST) && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  })
}

// Upgrade to HTTP server with WebSocket support
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })
const online = new Map()
function addClient(userId, ws){ let s=online.get(userId); if(!s){ s=new Set(); online.set(userId,s)} s.add(ws) }
function removeClient(userId, ws){ const s=online.get(userId); if(!s) return; s.delete(ws); if(!s.size) online.delete(userId) }

wss.on('connection', (ws, req) => {
  const cookie = req.headers['cookie'] || ''
  const m = cookie.match(/auth=([^;]+)/)
  const token = m ? decodeURIComponent(m[1]) : null
  const payload = token ? decodeToken(token) : null
  const uid = payload?.uid
  if (!uid) return ws.close()
  ws.userId = String(uid)
  addClient(ws.userId, ws)
  ws.on('close', () => removeClient(ws.userId, ws))
})

ensureSchema().then(() => {
  server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))
}).catch(err => {
  console.error('DB init failed', err)
  process.exit(1)
})

process.on('SIGINT', () => { db.close(); process.exit(0) })
