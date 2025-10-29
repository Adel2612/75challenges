import React, { useEffect, useState } from 'react'

export default function Friends() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [inbox, setInbox] = useState([])
  const [shareUrl, setShareUrl] = useState('')
  const [message, setMessage] = useState('')

  async function search() {
    if (!q.trim()) { setResults([]); return }
    const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
    if (r.ok) setResults(await r.json())
  }
  async function loadInbox() {
    const r = await fetch('/api/inbox', { credentials: 'include' })
    if (r.ok) setInbox(await r.json())
  }
  useEffect(()=>{ loadInbox() }, [])

  async function send(to) {
    try {
      const token = shareUrl.split('/share/')[1] || shareUrl
      const r = await fetch('/api/share/send', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to_user_id: to.id, token, message }) })
      if (r.ok) { setMessage(''); alert('Отправлено!') }
      else alert('Не удалось отправить')
    } catch { alert('Не удалось отправить') }
  }

  return (
    <div className="card">
      <div className="title">Друзья</div>
      <div className="list" style={{marginTop:8}}>
        <div className="row">
          <input className="input" placeholder="Поиск по email или имени" value={q} onChange={e=>setQ(e.target.value)} />
          <button className="btn" onClick={search}>Найти</button>
        </div>
        <div className="row" style={{gap:8}}>
          <input className="input" placeholder="Вставьте ссылку /share/..." value={shareUrl} onChange={e=>setShareUrl(e.target.value)} />
          <input className="input" placeholder="Сообщение (опционально)" value={message} onChange={e=>setMessage(e.target.value)} />
        </div>
        {results.length>0 && (
          <div className="list">
            {results.map(u => (
              <div className="row" key={u.id} style={{justifyContent:'space-between'}}>
                <div className="muted">{u.name || u.email}</div>
                <button className="btn" onClick={()=>send(u)}>Отправить</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="title" style={{marginTop:16}}>Входящие</div>
      <div className="list" style={{marginTop:8}}>
        {inbox.length===0 && <div className="muted">Пока пусто</div>}
        {inbox.map(item => {
          let payload = {}
          try { payload = JSON.parse(item.payload||'{}') } catch {}
          return (
            <div className="card" key={item.id}>
              <div className="row" style={{justifyContent:'space-between'}}>
                <div>
                  <div className="title">{item.type==='share'?'Поделились прогрессом':'Сообщение'}</div>
                  <div className="muted">{payload.message||''}</div>
                </div>
                {payload.token && <a className="btn" href={`/share/${payload.token}`} target="_blank" rel="noreferrer">Открыть</a>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

