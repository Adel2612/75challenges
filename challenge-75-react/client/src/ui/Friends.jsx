import React, { useEffect, useState } from 'react'
import { API_BASE } from '../api'

export default function Friends() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [inbox, setInbox] = useState([])
  const [shareUrl, setShareUrl] = useState('')
  const [message, setMessage] = useState('')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [online, setOnline] = useState([])
  const [active, setActive] = useState(null)
  const [chat, setChat] = useState([])
  const [chatText, setChatText] = useState('')
  const [me, setMe] = useState(null)

  async function search() {
    if (!q.trim()) { setResults([]); return }
    const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
    if (r.ok) setResults(await r.json())
  }
  async function loadInbox() {
    const r = await fetch('/api/inbox', { credentials: 'include' })
    if (r.ok) setInbox(await r.json())
  }
  async function loadFriends(){ const r = await fetch('/api/friends',{credentials:'include'}); if(r.ok) setFriends(await r.json()) }
  async function loadRequests(){ const r = await fetch('/api/friends/requests',{credentials:'include'}); if(r.ok) setRequests(await r.json()) }
  async function loadOnline(){ const r = await fetch('/api/friends/online',{credentials:'include'}); if(r.ok) setOnline(await r.json()) }
  async function loadMe(){ const r = await fetch('/api/auth/me',{credentials:'include'}); if(r.ok){ const j=await r.json(); setMe(j.user||null) } }
  useEffect(()=>{ loadInbox(); loadFriends(); loadRequests(); loadOnline(); loadMe(); const t=setInterval(loadOnline, 10000); return ()=>clearInterval(t) }, [])

  async function send(to) {
    try {
      const token = shareUrl.split('/share/')[1] || shareUrl
      const r = await fetch('/api/share/send', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to_user_id: to.id, token, message }) })
      if (r.ok) { setMessage(''); alert('Отправлено!') }
      else alert('Не удалось отправить')
    } catch { alert('Не удалось отправить') }
  }

  async function sendMsg(to){
    if(!message.trim()) return
    const r = await fetch('/api/messages/send',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({to_user_id:to.id,message})})
    if(r.ok){ setMessage(''); alert('Сообщение отправлено') } else alert('Не удалось отправить')
  }

  async function addFriend(u){ await fetch('/api/friends/request',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({to_user_id:u.id})}); await loadRequests() }
  async function acceptFriend(id){ await fetch(`/api/friends/${id}/accept`,{method:'POST',credentials:'include'}); await loadFriends(); await loadRequests() }
  async function removeFriend(id){ await fetch(`/api/friends/${id}`,{method:'DELETE',credentials:'include'}); await loadFriends(); await loadRequests() }

  // Chat
  async function openChat(f){ setActive(f); const r = await fetch(`/api/chat/${f.user_id}`,{credentials:'include'}); if(r.ok){ const msgs = await r.json(); setChat(msgs); if(msgs.length){ await fetch(`/api/chat/${f.user_id}/read`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({upto: msgs[msgs.length-1].id})}) } } }
  async function sendChat(){ if(!active || !chatText.trim()) return; const body = { text: chatText.trim() }; const r = await fetch(`/api/chat/${active.user_id}/send`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); if(r.ok){ setChatText(''); const rr = await fetch(`/api/chat/${active.user_id}?after=${encodeURIComponent(chat.length?chat[chat.length-1].created_at:'')}`,{credentials:'include'}); if(rr.ok){ const more = await rr.json(); setChat(c=>[...c, ...more]) } } }

  useEffect(()=>{
    // WebSocket for realtime
    const origin = (API_BASE || window.location.origin)
    const wsUrl = origin.replace(/^http/, 'ws') + '/ws'
    const ws = new WebSocket(wsUrl)
    ws.onmessage = ev => {
      try { const msg = JSON.parse(ev.data)
        if (msg.type==='chat' && active && msg.from===active.user_id){ setChat(c=>[...c, { id: msg.id, from_user_id: msg.from, to_user_id: msg.to, text: msg.text, reply_to: msg.reply_to||null, created_at: msg.created_at, read_at: null }]) }
      } catch {}
    }
    return ()=>ws.close()
  }, [active?.user_id])

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

      <div className="title" style={{marginTop:16}}>Ваши друзья</div>
      <div className="list" style={{marginTop:8}}>
        {friends.length===0 && <div className="muted">Пока нет друзей</div>}
        {friends.map(f => (
          <div className="row" key={f.user_id} style={{justifyContent:'space-between', alignItems:'center'}}>
            <div className="row" style={{gap:8, alignItems:'center'}}>
              <img src={`${API_BASE}/api/user/${f.user_id}/avatar`} alt="ava" style={{width:32,height:32,borderRadius:'50%',objectFit:'cover',border:'1px solid var(--border)'}} onError={(e)=>{e.currentTarget.style.display='none'}} />
              <div className="muted">{f.name || f.email} {online.includes(f.user_id) && <span className="chip" style={{marginLeft:6}}>online</span>}</div>
            </div>
            <div className="row">
              <button className="btn" onClick={()=>sendMsg({id:f.user_id})}>Сообщение</button>
              <button className="btn" onClick={()=>openChat(f)}>Открыть чат</button>
              <button className="btn danger" onClick={()=>removeFriend(f.id)}>Удалить</button>
            </div>
          </div>
        ))}
      </div>

      {active && (
        <div className="card" style={{marginTop:12}}>
          <div className="row" style={{justifyContent:'space-between', alignItems:'center'}}>
            <div className="title">Чат с {active.name || active.email}</div>
            <button className="btn" onClick={()=>setActive(null)}>Закрыть</button>
          </div>
          <div className="list" style={{maxHeight:320, overflow:'auto', marginTop:8}}>
            {chat.map(m => (
              <div key={m.id} style={{display:'flex', justifyContent: m.from_user_id===me?.id?'flex-end':'flex-start'}}>
                <div className="card" style={{maxWidth:'70%'}}>
                  <div>{m.text}</div>
                  <div className="muted" style={{fontSize:12, marginTop:4}}>{new Date(m.created_at).toLocaleString()} {m.read_at? '✓✓':'✓'}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{marginTop:8}}>
            <input className="input" placeholder="Напишите сообщение" value={chatText} onChange={e=>setChatText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); sendChat() } }} />
            <button className="btn" onClick={sendChat}>Отправить</button>
          </div>
        </div>
      )}

      <div className="title" style={{marginTop:16}}>Заявки в друзья</div>
      <div className="list">
        {requests.incoming.map(r => (
          <div className="row" key={r.id} style={{justifyContent:'space-between'}}>
            <div className="muted">{r.name || r.email} хочет добавить в друзья</div>
            <div className="row">
              <button className="btn" onClick={()=>acceptFriend(r.id)}>Принять</button>
              <button className="btn danger" onClick={()=>removeFriend(r.id)}>Отклонить</button>
            </div>
          </div>
        ))}
        {requests.outgoing.map(r => (
          <div className="row" key={r.id} style={{justifyContent:'space-between'}}>
            <div className="muted">Ожидает: {r.name || r.email}</div>
            <button className="btn danger" onClick={()=>removeFriend(r.id)}>Отменить</button>
          </div>
        ))}
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
