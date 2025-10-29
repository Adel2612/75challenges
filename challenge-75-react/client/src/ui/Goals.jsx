import React, { useEffect, useState } from 'react'
import { api } from '../api'

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')

  async function load() { setGoals(await api.goals.list()) }
  useEffect(() => { load() }, [])

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="title">Цели</div>
        <div className="row">
          <input className="input" placeholder="Новая цель" value={title} onChange={e=>setTitle(e.target.value)} />
          <input className="input" type="date" value={due} onChange={e=>setDue(e.target.value)} />
          <button className="btn" onClick={async()=>{ if(!title.trim())return; await api.goals.add(title.trim(), due||null); setTitle(''); setDue(''); await load() }}>Добавить</button>
        </div>
      </div>
      <div className="list" style={{marginTop:10}}>
        {goals.length===0 && <div className="muted">Нет целей</div>}
        {goals.map(g => (
          <div key={g.id} className={"card"}>
            <div className="row" style={{justifyContent:'space-between'}}>
              <label className="row" style={{gap:8}}>
                <input type="checkbox" checked={!!g.done} onChange={async e=>{ await api.goals.update(g.id, { done: e.target.checked }); await load() }} />
                <input className="input" value={g.title} onChange={async e=>{ await api.goals.update(g.id, { title: e.target.value }); await load() }} />
              </label>
              <div className="row">
                <input className="input" type="date" value={g.due||''} onChange={async e=>{ await api.goals.update(g.id, { due: e.target.value||null }); await load() }} />
                <button className="btn danger" onClick={async()=>{ await api.goals.remove(g.id); await load() }}>Удалить</button>
              </div>
            </div>
            <div className="row" style={{marginTop:8}}>
              <input className="input" placeholder="Заметки" value={g.notes||''} onChange={async e=>{ await api.goals.update(g.id, { notes: e.target.value }); }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

