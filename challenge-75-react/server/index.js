import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import multer from 'multer'
import { fileURLToPath } from 'url'
import { db, ensureSchema, toState, upsertDay, resetAll, importState, UPLOADS_DIR, all, run, get } from './lib/db.js'

const PORT = process.env.PORT || 4000
const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

// Serve built React client if available (production single process)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLIENT_DIST = path.join(__dirname, '../client/dist')
if (fs.existsSync(CLIENT_DIST) && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(express.static(CLIENT_DIST))
}

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

// State
app.get('/api/state', async (_req, res) => {
  try {
    const state = await toState()
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
    await upsertDay(day, tasks, null)
    const state = await toState()
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
    await upsertDay(day, null, { note, weight })
    const state = await toState()
    res.json(state)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'failed_to_update' })
  }
})

// Goals
app.get('/api/goals', async (_req, res) => {
  const goals = await all(`SELECT id, title, due, done, notes, created_at FROM goals ORDER BY created_at DESC`)
  res.json(goals)
})

app.post('/api/goals', async (req, res) => {
  const { title, due } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title_required' })
  const id = crypto.randomUUID()
  const created = new Date().toISOString()
  await run(`INSERT INTO goals(id, title, due, done, notes, created_at) VALUES(?,?,?,?,?,?)`, [id, title, due ?? null, 0, '', created])
  res.json({ id, title, due: due ?? null, done: 0, notes: '', created_at: created })
})

app.put('/api/goals/:id', async (req, res) => {
  const { id } = req.params
  const { title, due, done, notes } = req.body || {}
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
})

app.delete('/api/goals/:id', async (req, res) => {
  await run(`DELETE FROM goals WHERE id = ?`, [req.params.id])
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
  const rows = await all(`SELECT id, name, type, size FROM attachments WHERE day = ? ORDER BY created_at ASC`, [day])
  res.json(rows)
})

app.post('/api/day/:day/attachments', upload.array('files'), async (req, res) => {
  const day = Number(req.params.day)
  const files = req.files || []
  const now = new Date().toISOString()
  for (const f of files) {
    const id = crypto.randomUUID()
    await run(`INSERT INTO attachments(id, day, name, type, size, path, created_at) VALUES(?,?,?,?,?,?,?)`, [
      id, day, f.originalname, f.mimetype, f.size, f.path, now
    ])
  }
  const rows = await all(`SELECT id, name, type, size FROM attachments WHERE day = ? ORDER BY created_at ASC`, [day])
  res.json(rows)
})

app.get('/api/attachments/:id/download', async (req, res) => {
  const row = await get(`SELECT name, type, path FROM attachments WHERE id = ?`, [req.params.id])
  if (!row || !fs.existsSync(row.path)) return res.status(404).end()
  res.setHeader('Content-Type', row.type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`)
  fs.createReadStream(row.path).pipe(res)
})

app.delete('/api/attachments/:id', async (req, res) => {
  const row = await get(`SELECT path FROM attachments WHERE id = ?`, [req.params.id])
  if (row && fs.existsSync(row.path)) {
    try { fs.unlinkSync(row.path) } catch {}
  }
  await run(`DELETE FROM attachments WHERE id = ?`, [req.params.id])
  res.json({ ok: true })
})

// Inline view for images
app.get('/api/attachments/:id/view', async (req, res) => {
  const row = await get(`SELECT name, type, path FROM attachments WHERE id = ?`, [req.params.id])
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
app.get('/api/tasks/types', async (_req, res) => {
  const rows = await all(`SELECT key, title, emoji, position FROM task_types ORDER BY position ASC`)
  res.json(rows)
})

app.post('/api/tasks/types', async (req, res) => {
  const { title, emoji } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title_required' })
  // make key slug
  const base = (title || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'task'
  let candidate = base, i = 1
  while (await get(`SELECT key FROM task_types WHERE key = ?`, [candidate])) candidate = `${base}-${i++}`
  const posRow = await get(`SELECT COALESCE(MAX(position),0) as p FROM task_types`)
  const position = (posRow?.p || 0) + 1
  await run(`INSERT INTO task_types(key,title,emoji,position) VALUES(?,?,?,?)`, [candidate, title, emoji ?? null, position])
  // seed for all days
  for (let d = 1; d <= 75; d++) await run(`INSERT OR IGNORE INTO tasks(day,key,done) VALUES(?,?,0)`, [d, candidate])
  res.json({ key: candidate, title, emoji: emoji ?? null, position })
})

app.put('/api/tasks/types/:key', async (req, res) => {
  const { key } = req.params
  const { title, emoji, position } = req.body || {}
  const exists = await get(`SELECT key FROM task_types WHERE key = ?`, [key])
  if (!exists) return res.status(404).json({ error: 'not_found' })
  if (position !== undefined) await run(`UPDATE task_types SET position = ? WHERE key = ?`, [Number(position), key])
  await run(`UPDATE task_types SET title = COALESCE(?, title), emoji = COALESCE(?, emoji) WHERE key = ?`, [title ?? null, emoji ?? null, key])
  res.json({ ok: true })
})

app.delete('/api/tasks/types/:key', async (req, res) => {
  const { key } = req.params
  await run(`DELETE FROM task_types WHERE key = ?`, [key])
  await run(`DELETE FROM tasks WHERE key = ?`, [key])
  res.json({ ok: true })
})

// ----------------- Ascetics (Аскеза) -----------------
// Create ascetic
app.post('/api/ascetics', async (req, res) => {
  const { title, reward, duration, startDate } = req.body || {}
  const d = Number(duration)
  if (!title || !Number.isInteger(d) || d < 1 || d > 365) return res.status(400).json({ error: 'bad_payload' })
  const id = crypto.randomUUID()
  const created = new Date().toISOString()
  await run(`INSERT INTO ascetics(id, title, reward, duration, start_date, created_at) VALUES(?,?,?,?,?,?)`, [
    id, title, reward ?? null, d, startDate ?? null, created
  ])
  for (let i=1;i<=d;i++) await run(`INSERT OR IGNORE INTO ascetic_days(ascetic_id, day, done, note) VALUES(?,?,0,'')`, [id, i])
  res.json({ id, title, reward: reward??null, duration: d, start_date: startDate??null, created_at: created })
})

// List ascetics
app.get('/api/ascetics', async (_req, res) => {
  const rows = await all(`SELECT id, title, reward, duration, start_date, created_at FROM ascetics ORDER BY created_at DESC`)
  res.json(rows)
})

// Get ascetic with days
app.get('/api/ascetics/:id', async (req, res) => {
  const id = req.params.id
  const asc = await get(`SELECT id, title, reward, duration, start_date, created_at FROM ascetics WHERE id = ?`, [id])
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
  const rows = await all(`SELECT id, day, name, type, size FROM ascetic_attachments WHERE ascetic_id = ? ORDER BY created_at ASC`, [req.params.id])
  res.json(rows)
})

app.post('/api/ascetics/:id/attachments', ascUpload.array('files'), async (req, res) => {
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

// SPA fallback (only when static is enabled)
if (fs.existsSync(CLIENT_DIST) && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  })
}

ensureSchema().then(() => {
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))
}).catch(err => {
  console.error('DB init failed', err)
  process.exit(1)
})

process.on('SIGINT', () => { db.close(); process.exit(0) })
