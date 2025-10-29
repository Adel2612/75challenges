import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'

const BASE_DIR = process.env.STORAGE_DIR || process.cwd()
const DATA_DIR = path.join(BASE_DIR, 'data')
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads')
const DB_FILE = path.join(DATA_DIR, 'challenge75.sqlite')

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

ensureDir(DATA_DIR)
ensureDir(UPLOADS_DIR)

sqlite3.verbose()
export const db = new sqlite3.Database(DB_FILE)

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export async function ensureSchema() {
  await run(`PRAGMA journal_mode = WAL;`)
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    theme TEXT DEFAULT 'pink',
    created_at TEXT NOT NULL
  );`)
  await run(`CREATE TABLE IF NOT EXISTS task_types (
    key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    emoji TEXT,
    position INTEGER NOT NULL
  );`)
  await run(`CREATE TABLE IF NOT EXISTS days (
    day INTEGER PRIMARY KEY,
    note TEXT,
    weight REAL
  );`)
  await run(`CREATE TABLE IF NOT EXISTS tasks (
    day INTEGER NOT NULL,
    key TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, key)
  );`)
  await run(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    size INTEGER,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`)
  await run(`CREATE TABLE IF NOT EXISTS ascetics (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    reward TEXT,
    duration INTEGER NOT NULL,
    start_date TEXT,
    created_at TEXT NOT NULL
  );`)
  await run(`CREATE TABLE IF NOT EXISTS ascetic_days (
    ascetic_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    PRIMARY KEY (ascetic_id, day)
  );`)
  await run(`CREATE TABLE IF NOT EXISTS ascetic_attachments (
    id TEXT PRIMARY KEY,
    ascetic_id TEXT NOT NULL,
    day INTEGER,
    name TEXT NOT NULL,
    type TEXT,
    size INTEGER,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`)
  try { await run(`ALTER TABLE ascetics ADD COLUMN user_id TEXT`) } catch (e) {}
  await run(`CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    due TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL
  );`)

  // Per-user overlay tables
  await run(`CREATE TABLE IF NOT EXISTS user_tasks (
    user_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    key TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day, key)
  );`)
  await run(`CREATE TABLE IF NOT EXISTS user_days (
    user_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    note TEXT,
    weight REAL,
    PRIMARY KEY (user_id, day)
  );`)
  await run(`CREATE TABLE IF NOT EXISTS user_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    due TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL
  );`)
  await run(`CREATE TABLE IF NOT EXISTS user_attachments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    size INTEGER,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`)

  // Seed tasks rows for 75 days x 6 keys if missing
  const defaultTypes = [
    { key:'wo1', title:'Тренировка 1', emoji:'💪', position:1 },
    { key:'wo2', title:'Тренировка 2 (улица)', emoji:'🚶‍♀️', position:2 },
    { key:'diet', title:'Питание по плану', emoji:'🥗', position:3 },
    { key:'water', title:'Вода 3.8л', emoji:'💧', position:4 },
    { key:'read', title:'Чтение 10 страниц', emoji:'📚', position:5 },
    { key:'photo', title:'Фото прогресса', emoji:'📸', position:6 }
  ]
  for (const t of defaultTypes) {
    await run(`INSERT OR IGNORE INTO task_types(key,title,emoji,position) VALUES(?,?,?,?)`, [t.key, t.title, t.emoji, t.position])
  }
  const keys = (await all(`SELECT key FROM task_types ORDER BY position ASC`)).map(r=>r.key)
  for (let d = 1; d <= 75; d++) {
    for (const k of keys) {
      await run(`INSERT OR IGNORE INTO tasks(day, key, done) VALUES(?,?,0)`, [d, k])
    }
    await run(`INSERT OR IGNORE INTO days(day, note, weight) VALUES(?, '', NULL)`, [d])
  }
}

export async function toState() {
  const days = []
  const taskTypes = await all(`SELECT key, title, emoji, position FROM task_types ORDER BY position ASC`)
  for (let d = 1; d <= 75; d++) {
    const row = await get(`SELECT day, note, weight FROM days WHERE day = ?`, [d])
    const trows = await all(`SELECT key, done FROM tasks WHERE day = ?`, [d])
    const taskMap = Object.fromEntries(trows.map(r => [r.key, !!r.done]))
    const tasks = Object.fromEntries(taskTypes.map(tt => [tt.key, !!taskMap[tt.key]]))
    const atts = await all(`SELECT id, name, type, size FROM attachments WHERE day = ? ORDER BY created_at ASC`, [d])
    days.push({
      day: d,
      tasks,
      note: row?.note || '',
      weight: row?.weight ?? null,
      attachments: atts
    })
  }
  const goals = await all(`SELECT id, title, due, done, notes, created_at FROM goals ORDER BY created_at DESC`)
  return { days, goals, taskTypes, startedAt: new Date(0).toISOString() }
}

export async function upsertDay(day, tasks = null, details = null) {
  await run(`INSERT OR IGNORE INTO days(day) VALUES(?)`, [day])
  if (tasks && typeof tasks === 'object') {
    for (const [k, v] of Object.entries(tasks)) {
      await run(`INSERT OR IGNORE INTO tasks(day, key, done) VALUES(?,?,0)`, [day, k])
      await run(`UPDATE tasks SET done = ? WHERE day = ? AND key = ?`, [v ? 1 : 0, day, k])
    }
  }
  if (details && typeof details === 'object') {
    const { note, weight } = details
    await run(`UPDATE days SET note = COALESCE(?, note), weight = ? WHERE day = ?`, [
      typeof note === 'string' ? note : null,
      (weight === null || weight === undefined || weight === '') ? null : Number(weight),
      day
    ])
  }
}

export async function resetAll() {
  await run(`DELETE FROM tasks`)
  await run(`DELETE FROM days`)
  await run(`DELETE FROM goals`)
  await run(`DELETE FROM attachments`)
  // Keep files on disk but orphaned; optionally clean uploads dir here.
  await ensureSchema()
}

export async function importState(state) {
  if (!state || !Array.isArray(state.days)) throw new Error('bad_state')
  await resetAll()
  if (Array.isArray(state.taskTypes) && state.taskTypes.length) {
    // Apply custom tasks first
    for (const [i, tt] of state.taskTypes.entries()) {
      await run(`INSERT OR REPLACE INTO task_types(key,title,emoji,position) VALUES(?,?,?,?)`, [tt.key, tt.title, tt.emoji ?? null, tt.position ?? (i+1)])
    }
    // seed task rows
    const keys = state.taskTypes.map(t=>t.key)
    for (let d = 1; d <= 75; d++) {
      for (const k of keys) await run(`INSERT OR IGNORE INTO tasks(day,key,done) VALUES(?,?,0)`, [d,k])
      await run(`INSERT OR IGNORE INTO days(day) VALUES(?)`, [d])
    }
  }
  for (const d of state.days) {
    await upsertDay(d.day, d.tasks || {}, { note: d.note ?? '', weight: d.weight ?? null })
  }
  if (Array.isArray(state.goals)) {
    for (const g of state.goals) {
      await run(`INSERT OR REPLACE INTO goals(id, title, due, done, notes, created_at) VALUES(?,?,?,?,?,?)`, [
        g.id, g.title, g.due ?? null, g.done ? 1 : 0, g.notes ?? '', g.created_at || new Date().toISOString()
      ])
    }
  }
}

export { UPLOADS_DIR }
