import React from 'react'
import { Icon } from './Icons.jsx'

const FALLBACK = [
  { key:'wo1', title:'Тренировка 1' },
  { key:'wo2', title:'Тренировка 2 (улица)' },
  { key:'diet', title:'Питание по плану' },
  { key:'water', title:'Вода 3.8л' },
  { key:'read', title:'Чтение 10 страниц' },
  { key:'photo', title:'Фото прогресса' }
]

export default function DayCard({ day, taskTypes, onToggle, onToggleAll, onOpenDetails, onQuickPhoto }) {
  const types = (taskTypes && taskTypes.length ? taskTypes : FALLBACK)
  const allDone = types.every(t => !!day.tasks[t.key])
  const done = types.reduce((a,t)=>a + (day.tasks[t.key]?1:0), 0)
  return (
    <div className={"card" + (allDone ? ' done' : '')}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="title">День {day.day}</div>
        <div className="muted">{done}/{types.length}</div>
      </div>
      <div className="tasks" style={{marginTop:8}}>
        {types.map(t => (
          <label key={t.key} className="task">
            <input type="checkbox" checked={!!day.tasks[t.key]} onChange={e=>onToggle(t.key, e.target.checked)} />
            <span>{t.emoji ? `${t.emoji} ` : ''}{t.title || t.key}</span>
          </label>
        ))}
      </div>
      <div className="card-actions">
        <button className="btn" onClick={onToggleAll}><Icon.Check style={{marginRight:6}}/>Переключить все</button>
        <button className="btn" onClick={onOpenDetails}><Icon.Settings style={{marginRight:6}}/>Детали</button>
        <label className="btn">
          <Icon.Photo style={{marginRight:6}}/>Фото
          <input type="file" accept="image/*" style={{display:'none'}} onChange={onQuickPhoto} />
        </label>
      </div>
    </div>
  )
}
