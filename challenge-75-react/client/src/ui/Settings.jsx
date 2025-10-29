import React, { useEffect, useState } from 'react'
import { api, API_BASE } from '../api'
import ThemePicker from './ThemePicker.jsx'

export default function Settings({ onChanged, state }) {
  const [types, setTypes] = useState(state.taskTypes||[])
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('')
  const [theme, setTheme] = useState('pink')
  const [shareLink, setShareLink] = useState('')
  const [shareInclude, setShareInclude] = useState(true)
  const [shareDays, setShareDays] = useState(0)
  const [avatarVer, setAvatarVer] = useState(0)
  
  useEffect(()=>{ setTypes(state.taskTypes||[]) }, [state.taskTypes])
  useEffect(()=>{ setTheme(document.documentElement.getAttribute('data-theme')||'pink') }, [])

  return (
    <div className="card">
      <div className="title">Задания на день</div>
      <div className="muted" style={{marginTop:6}}>Добавьте/переименуйте пункты — они появятся во всех днях.</div>
      <div className="row" style={{marginTop:10}}>
        <input className="input" placeholder="Название задания (например, Прогулка 30 мин)" value={title} onChange={e=>setTitle(e.target.value)} />
        <input className="input" placeholder="Эмодзи (опционально)" value={emoji} onChange={e=>setEmoji(e.target.value)} style={{width:160}} />
        <button className="btn" onClick={async ()=>{
          if(!title.trim()) return
          await api.taskTypes.add(title.trim(), emoji.trim()||null)
          setTitle(''); setEmoji('');
          await onChanged?.()
        }}>Добавить</button>
      </div>

      <div className="list" style={{marginTop:10}}>
        {types.map(t => (
          <div key={t.key} className="row" style={{justifyContent:'space-between'}}>
            <div className="row">
              <input className="input" style={{minWidth:260}} value={t.title} onChange={async e=>{ await api.taskTypes.update(t.key, { title: e.target.value }); await onChanged?.() }} />
              <input className="input" style={{width:120}} value={t.emoji||''} onChange={async e=>{ await api.taskTypes.update(t.key, { emoji: e.target.value }); await onChanged?.() }} />
            </div>
            <button className="btn danger" onClick={async ()=>{ if(confirm('Удалить это задание?')) { await api.taskTypes.remove(t.key); await onChanged?.() } }}>Удалить</button>
          </div>
        ))}
      </div>

      <div className="title" style={{marginTop:16}}>Тема</div>
      <div className="muted" style={{marginTop:6}}>Выберите тему интерфейса. Если вы вошли в аккаунт, тема сохранится в профиле.</div>
      <ThemePicker value={theme} onChange={async t=>{ setTheme(t); document.documentElement.setAttribute('data-theme', t); try { await api.user.theme(t) } catch {} }} />

      <div className="title" style={{marginTop:16}}>Аватар</div>
      <div className="row" style={{gap:12, alignItems:'center'}}>
        <div style={{width:48,height:48,borderRadius:'50%',overflow:'hidden',border:'1px solid var(--border)'}}>
          <img src={`${API_BASE}/api/user/avatar/me?${avatarVer}`} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={(e)=>{ e.currentTarget.style.display='none' }} />
        </div>
        <label className="btn">Загрузить
          <input type="file" accept="image/*" hidden onChange={async e=>{ const f=e.target.files?.[0]; if(!f) return; const fd=new FormData(); fd.append('file', f); await fetch(`${API_BASE}/api/user/avatar`,{method:'POST',body:fd,credentials:'include'}); setAvatarVer(v=>v+1); e.target.value='' }} />
        </label>
      </div>

      <div className="title" style={{marginTop:16}}>Поделиться результатами</div>
      <div className="list">
        <label className="row" style={{gap:8}}>
          <input type="checkbox" checked={shareInclude} onChange={e=>setShareInclude(e.target.checked)} /> Включить изображения
        </label>
        <div className="row" style={{gap:8}}>
          <span className="muted">Срок действия (дней, 0 — без срока):</span>
          <input className="input" type="number" min={0} max={365} value={shareDays} onChange={e=>setShareDays(Number(e.target.value||0))} style={{width:120}} />
          <button className="btn" onClick={async()=>{ try { const r = await apiRequest('/api/share/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({include_images:shareInclude,days:shareDays})}); const url = `${location.origin}/share/${r.token}`; setShareLink(url); await navigator.clipboard?.writeText(url) } catch {} }}>Создать ссылку</button>
        </div>
        {shareLink && <input className="input" readOnly value={shareLink} onFocus={e=>e.target.select()} />}
      </div>
    </div>
  )
}

async function apiRequest(path, opts){ const r = await fetch(path,{credentials:'include',...opts}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json() }
