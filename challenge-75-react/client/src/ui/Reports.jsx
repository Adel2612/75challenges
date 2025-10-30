import React, { useMemo } from 'react'
import { api } from '../api'

function chunkRanges(total, size) {
  const ranges = []
  for (let start = 1; start <= total; start += size) {
    const end = Math.min(start + size - 1, total)
    ranges.push([start, end])
  }
  return ranges
}

export default function Reports({ state }) {
  const ranges = useMemo(() => chunkRanges(75, 15), [])
  const keys = (state.taskTypes||[]).map(t=>t.key)

  return (
    <div className="list">
      {state.days?.length===0 && (
        <div className="empty">Пока нет данных для отчётов</div>
      )}
      {ranges.map(([a,b]) => {
        const days = state.days.filter(d => d.day >= a && d.day <= b)
        const tasksTotal = days.length * (keys.length||1)
        let tasksDone = 0, fullDays = 0
        const imgs = []
        let noteCount = 0
        let firstW = null, lastW = null
        const perTask = Object.fromEntries((keys.length?keys:Object.keys(days[0]?.tasks||{})).map(k=>[k,0]))
        for (const d of days) {
          const list = (keys.length? keys : Object.keys(d.tasks))
          const done = list.reduce((acc,k)=>acc+(d.tasks[k]?1:0),0)
          for (const k of list) if (d.tasks[k]) perTask[k]++
          tasksDone += done
          if (done === (keys.length||Object.keys(d.tasks).length)) fullDays++
          if ((d.note||'').trim()) noteCount++
          if (typeof d.weight==='number') { if (firstW==null) firstW=d.weight; lastW=d.weight }
          for (const a of d.attachments||[]) if ((a.type||'').startsWith('image/')) imgs.push(a)
        }
        const percent = tasksTotal ? Math.round(100*tasksDone/tasksTotal) : 0
        const weightDelta = (firstW!=null && lastW!=null) ? (lastW-firstW).toFixed(1) : null
        // streaks
        let current = 0, best = 0
        for (const d of days) {
          const success = ((keys.length? keys : Object.keys(d.tasks)).every(k=>d.tasks[k]))
          if (success) { current++; best = Math.max(best, current) } else { current = 0 }
        }
        return (
          <div key={`${a}-${b}`} className="card">
            <div className="row" style={{justifyContent:'space-between'}}>
              <div className="title">Отчёт: дни {a}–{b}</div>
              <div className="muted">Прогресс: {percent}% · Закрыто дней: {fullDays}/{days.length} · Лучшая серия: {best} · Заметок: {noteCount}</div>
            </div>
            {weightDelta!=null && (
              <div className="muted" style={{marginTop:6}}>Изменение веса: {weightDelta} кг</div>
            )}
            <div className="list" style={{marginTop:6}}>
              {(state.taskTypes||[]).map(tt => (
                <div key={tt.key} className="muted">{tt.emoji?tt.emoji+' ':''}{tt.title||tt.key}: {perTask[tt.key]||0}/{days.length}</div>
              ))}
            </div>
            {imgs.length>0 && (
              <div className="thumbs" style={{marginTop:10}}>
                  {imgs.map(img => (
                  <a key={img.id} className="thumb" href={api.attachments.viewUrl(img.id)} target="_blank" rel="noreferrer">
                    <img src={api.attachments.viewUrl(img.id)} alt="" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
