import React, { useEffect, useState } from 'react'
import { api } from '../api'
import Spinner from './Spinner.jsx'

export default function DetailsModal({ day, onClose, onSave }) {
  const [note, setNote] = useState(day.note || '')
  const [weight, setWeight] = useState(day.weight ?? '')
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(true)
  const [custom, setCustom] = useState([])
  const [newTask, setNewTask] = useState('')

  async function loadAttachments() {
    setLoading(true)
    try {
      const rows = await api.attachments.list(day.day)
      setAttachments(rows)
    } finally {
      setLoading(false)
    }
  }

  async function loadCustom() {
    try {
      const r = await fetch(`/api/day/${day.day}/custom-tasks`, { credentials:'include' })
      if (r.ok) setCustom(await r.json())
    } catch {}
  }

  useEffect(() => { loadAttachments(); loadCustom() }, [day.day])

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="row" style={{justifyContent:'space-between'}}>
          <div className="title">День {day.day}</div>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
        <div className="split" style={{marginTop:10}}>
          <div className="list">
            <label className="muted">Заметка</label>
            <textarea className="input" rows={6} value={note} onChange={e=>setNote(e.target.value)} />
            <label className="muted">Вес (кг)</label>
            <input className="input" type="number" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)} />

            <label className="muted" style={{marginTop:8}}>Задачи этого дня</label>
            <div className="list">
              {custom.length===0 && <div className="empty">Добавьте первую задачу дня</div>}
              {custom.map(ct => (
                <div key={ct.id} className="row" style={{justifyContent:'space-between'}}>
                  <label className="row" style={{gap:8}}>
                    <input type="checkbox" checked={!!ct.done} onChange={async e=>{ await fetch(`/api/day/${day.day}/custom-tasks/${ct.id}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({done:e.target.checked})}); await loadCustom() }} />
                    <input className="input" value={ct.title} onChange={async e=>{ await fetch(`/api/day/${day.day}/custom-tasks/${ct.id}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:e.target.value})}); }} />
                  </label>
                  <button className="btn danger" onClick={async()=>{ await fetch(`/api/day/${day.day}/custom-tasks/${ct.id}`,{method:'DELETE',credentials:'include'}); await loadCustom() }}>Удалить</button>
                </div>
              ))}
              <div className="row">
                <input className="input" placeholder="Новая задача" value={newTask} onChange={e=>setNewTask(e.target.value)} />
                <button className="btn" onClick={async()=>{ if(!newTask.trim()) return; await fetch(`/api/day/${day.day}/custom-tasks`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:newTask.trim()})}); setNewTask(''); await loadCustom() }}>Добавить</button>
              </div>
            </div>
          </div>
          <div className="list">
            <div className="row" style={{justifyContent:'space-between'}}>
              <div className="muted">Вложения</div>
              <input id="upfile" type="file" multiple style={{display:'none'}} onChange={async e=>{
                const files = Array.from(e.target.files||[])
                if (files.length===0) return
                await api.attachments.upload(day.day, files)
                await loadAttachments()
                e.target.value = ''
              }} />
              <label htmlFor="upfile" className="btn">Прикрепить</label>
            </div>
            {loading ? <div className="row" style={{gap:8,alignItems:'center'}}><Spinner/><div className="muted">Загружаем вложения…</div></div> : (
              <div className="list">
                {attachments.length === 0 && <div className="empty">Пока нет вложений</div>}
                <div className="thumbs">
                  {attachments.filter(a => (a.type||'').startsWith('image/')).map(a => (
                    <a className="thumb" key={a.id} href={api.attachments.viewUrl(a.id)} target="_blank" rel="noreferrer">
                      <img src={api.attachments.viewUrl(a.id)} alt={a.name} />
                    </a>
                  ))}
                </div>
                {attachments.filter(a => !(a.type||'').startsWith('image/')).map(a => (
                  <div className="attachment" key={a.id}>
                    <div>{a.name}</div>
                    <a className="btn" href={api.attachments.downloadUrl(a.id)}>Скачать</a>
                    <button className="btn danger" onClick={async()=>{ await api.attachments.remove(a.id); await loadAttachments() }}>Удалить</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="row" style={{justifyContent:'flex-end', marginTop:10}}>
          <button className="btn" onClick={()=>onSave({ note, weight: (weight === '' ? null : Number(weight)) })}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
