import React, { useEffect, useState } from 'react'
import { api } from '../api'

export default function Settings({ onChanged, state }) {
  const [types, setTypes] = useState(state.taskTypes||[])
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('')

  useEffect(()=>{ setTypes(state.taskTypes||[]) }, [state.taskTypes])

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
    </div>
  )
}

