import React, { useEffect, useState } from 'react'
import { api } from '../api'

function AsceticCard({ asc, onOpen, onDelete }) {
  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="title">{asc.title}</div>
        <div className="muted">{asc.duration} дней</div>
      </div>
      <div className="muted" style={{marginTop:6}}>Вознаграждение: {asc.reward || '—'}</div>
      <div className="row" style={{marginTop:8}}>
        <button className="btn" onClick={onOpen}>Открыть</button>
        <button className="btn danger" onClick={onDelete}>Удалить</button>
      </div>
    </div>
  )
}

export default function Ascetics() {
  const [list, setList] = useState([])
  const [title, setTitle] = useState('')
  const [reward, setReward] = useState('')
  const [duration, setDuration] = useState(30)
  const [startDate, setStartDate] = useState('')
  const [open, setOpen] = useState(null)

  async function load() { setList(await api.ascetics.list()) }
  useEffect(()=>{ load() }, [])

  return (
    <div>
      {!open && (
        <div className="card">
          <div className="title">Аскеза</div>
          <div className="muted" style={{marginTop:6}}>Задайте задание, вознаграждение и длительность — и отмечайте дни.</div>
          <div className="row" style={{marginTop:8}}>
            <input className="input" placeholder="Задание" value={title} onChange={e=>setTitle(e.target.value)} />
            <input className="input" placeholder="Вознаграждение" value={reward} onChange={e=>setReward(e.target.value)} />
            <input className="input" type="number" min={1} max={365} value={duration} onChange={e=>setDuration(Number(e.target.value)||1)} />
            <input className="input" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
            <button className="btn" onClick={async()=>{
              if (!title.trim()) return
              await api.ascetics.create(title.trim(), reward.trim()||null, duration, startDate||null)
              setTitle(''); setReward(''); setDuration(30); setStartDate('')
              await load()
            }}>Создать</button>
          </div>
        </div>
      )}

      {!open && (
        <div className="grid" style={{marginTop:12}}>
          {list.map(asc => (
            <AsceticCard key={asc.id} asc={asc} onOpen={()=>setOpen(asc.id)} onDelete={async()=>{ if (confirm('Удалить аскезу?')) { await api.ascetics.remove(asc.id); await load() } }} />
          ))}
        </div>
      )}

      {open && <AsceticDetails id={open} onBack={()=>setOpen(null)} />}
    </div>
  )
}

function AsceticDetails({ id, onBack }) {
  const [asc, setAsc] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setAsc(await api.ascetics.get(id)) } finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [id])

  if (loading) return <div className="card">Загрузка…</div>
  if (!asc) return <div className="card">Не найдено</div>

  const doneCount = asc.days.reduce((a,d)=>a+(d.done?1:0),0)
  const percent = Math.round(100*doneCount/asc.days.length)

  return (
    <div className="card">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="title">{asc.title}</div>
        <button className="btn" onClick={onBack}>Назад</button>
      </div>
      <div className="muted" style={{marginTop:6}}>Вознаграждение: {asc.reward||'—'} · Дней: {asc.duration} · Прогресс: {percent}% ({doneCount}/{asc.days.length})</div>

      <div className="grid" style={{marginTop:12}}>
        {asc.days.map(d => (
          <div key={d.day} className={"card" + (d.done?' done':'')}>
            <div className="row" style={{justifyContent:'space-between'}}>
              <div className="title">День {d.day}</div>
              <label className="row"><input type="checkbox" checked={!!d.done} onChange={async e=>{ await api.ascetics.setDay(asc.id, d.day, { done: e.target.checked }); await load() }} /> <span>Готово</span></label>
            </div>
            <div className="list" style={{marginTop:8}}>
              <textarea className="input" rows={3} placeholder="Заметка" defaultValue={d.note||''} onBlur={async e=>{ await api.ascetics.setDay(asc.id, d.day, { note: e.target.value }); }} />
              <div className="row" style={{justifyContent:'space-between'}}>
                <input id={`up_${id}_${d.day}`} type="file" accept="image/*" multiple style={{display:'none'}} onChange={async e=>{ const files=Array.from(e.target.files||[]); if(files.length){ await api.ascetics.attachments.upload(asc.id, files, d.day); await load(); e.target.value='' } }} />
                <label htmlFor={`up_${id}_${d.day}`} className="btn">Фото</label>
                <a className="btn" onClick={async ()=>{ const rows = await api.ascetics.attachments.list(asc.id); setAsc(a=>({...a, attachments: rows})) }}>Обновить фото</a>
              </div>
              <div className="thumbs">
                {(asc.attachments||[]).filter(a=>a.day===d.day && (a.type||'').startsWith('image/')).map(a => (
                  <a key={a.id} className="thumb" href={api.ascetics.attachments.viewUrl(a.id)} target="_blank" rel="noreferrer">
                    <img src={api.ascetics.attachments.viewUrl(a.id)} alt={a.name} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

