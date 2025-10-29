import React, { useEffect, useState } from 'react'
import { api } from '../api'

export default function AuthBar({ onAuthChange, onTheme }) {
  const [user, setUser] = useState(null)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  async function refresh() {
    try { const r = await api.auth.me(); setUser(r.user); onAuthChange?.(r.user); if (r.user?.theme) onTheme?.(r.user.theme) } catch {}
  }
  useEffect(()=>{ refresh() }, [])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    try {
      if (mode==='login') await api.auth.login(email, password)
      else await api.auth.register(email, password, name)
      setEmail(''); setPassword(''); setName('')
      await refresh()
    } catch (e) { setErr('Ошибка входа/регистрации') }
  }

  if (user) {
    return (
      <div className="row">
        <div className="muted">{user.name || user.email}</div>
        <button className="btn" onClick={async()=>{ await api.auth.logout(); setUser(null); onAuthChange?.(null) }}>Выйти</button>
      </div>
    )
  }

  return (
    <form className="row" onSubmit={submit}>
      {mode==='register' && (
        <input className="input" placeholder="Имя (опционально)" value={name} onChange={e=>setName(e.target.value)} />
      )}
      <input className="input" type="email" required placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input className="input" type="password" required placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)} />
      <button className="btn" type="submit">{mode==='login'?'Войти':'Зарегистрироваться'}</button>
      <button type="button" className="btn" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'Регистрация':'Есть аккаунт'}</button>
      {err && <div className="muted">{err}</div>}
    </form>
  )
}

