import React, { useState } from 'react'
import { api } from '../api'

export default function AuthModal({ user, onAuthChange }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setErr('')
    try {
      if (mode === 'login') await api.auth.login(email, password)
      else await api.auth.register(email, password, name)
      const me = await api.auth.me()
      onAuthChange?.(me.user || null)
      setOpen(false)
      setEmail(''); setPassword(''); setName('')
    } catch (e) {
      setErr('Ошибка авторизации')
    }
  }

  async function logout() {
    await api.auth.logout()
    onAuthChange?.(null)
  }

  if (user) {
    return (
      <div className="row">
        <div className="muted">{user.name || user.email}</div>
        <button className="btn" onClick={logout}>Выйти</button>
      </div>
    )
  }

  return (
    <div className="row">
      <button className="btn" onClick={()=>{ setMode('login'); setOpen(true) }}>Войти</button>
      <button className="btn" onClick={()=>{ setMode('register'); setOpen(true) }}>Регистрация</button>
      {open && (
        <div className="modal" onClick={()=>setOpen(false)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()}>
            <div className="row" style={{justifyContent:'space-between'}}>
              <div className="title">{mode==='login'?'Вход':'Регистрация'}</div>
              <button className="btn" onClick={()=>setOpen(false)}>Закрыть</button>
            </div>
            <div className="row" style={{marginTop:8}}>
              <button className="btn" style={{opacity: mode==='login'?1:0.6}} onClick={()=>setMode('login')}>Вход</button>
              <button className="btn" style={{opacity: mode==='register'?1:0.6}} onClick={()=>setMode('register')}>Регистрация</button>
            </div>
            <form className="list" style={{marginTop:10}} onSubmit={submit}>
              {mode==='register' && (
                <input className="input" placeholder="Имя (опционально)" value={name} onChange={e=>setName(e.target.value)} />
              )}
              <input className="input" type="email" required placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="input" type="password" required placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)} />
              {err && <div className="muted">{err}</div>}
              <div className="row" style={{justifyContent:'flex-end'}}>
                <button className="btn" type="submit">{mode==='login'?'Войти':'Зарегистрироваться'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

