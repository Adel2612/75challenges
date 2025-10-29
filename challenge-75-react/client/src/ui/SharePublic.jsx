import React, { useEffect, useState, useMemo } from 'react'

export default function SharePublic({ token }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(()=>{ (async()=>{
    try { const r = await fetch(`/api/share/${token}`); if(!r.ok) throw new Error(); const j = await r.json(); setData(j) }
    catch { setErr('Ссылка недоступна или истекла') }
  })() }, [token])

  if (err) return <div className="container">{err}</div>
  if (!data) return <div className="container">Загрузка…</div>

  const taskKeys = (data.taskTypes||[]).map(t=>t.key)
  const stats = useMemo(()=>{
    const tasksTotal = data.days.length * taskKeys.length
    let tasksDone = 0, fullDays = 0
    for (const d of data.days) {
      const done = taskKeys.reduce((a,k)=>a+(d.tasks[k]?1:0),0)
      tasksDone += done
      if (done===taskKeys.length) fullDays++
    }
    const percent = tasksTotal? Math.round(100*tasksDone/tasksTotal):0
    return { tasksDone, tasksTotal, fullDays, percent }
  }, [data])

  return (
    <div className="container">
      <header>
        <div className="row" style={{alignItems:'center', gap:12}}>
          {data.user?.avatar && <img src={data.user.avatar} alt="avatar" style={{width:48,height:48,borderRadius:'50%',objectFit:'cover',border:'1px solid var(--border)'}} />}
          <h1 style={{margin:0}}>{data.user?.name || 'Прогресс'}</h1>
        </div>
        <div className="muted" style={{marginTop:8}}>
          Прогресс: {stats.percent}% · Закрыто дней: {stats.fullDays}/75
        </div>
      </header>
      <section style={{marginTop:16}}>
        <div className="grid">
          {data.days.map(d => (
            <div key={d.day} className={"card" + ((taskKeys.every(k=>d.tasks[k])) ? ' done' : '')}>
              <div className="row" style={{justifyContent:'space-between'}}>
                <div className="title">День {d.day}</div>
                <div className="muted">{taskKeys.reduce((a,k)=>a+(d.tasks[k]?1:0),0)}/{taskKeys.length}</div>
              </div>
              {data.include_images && d.attachments?.length>0 && (
                <div className="thumbs" style={{marginTop:8}}>
                  {d.attachments.filter(a=>(a.type||'').startsWith('image/')).map(a => (
                    <a key={a.id} className="thumb" href={`/api/share/${token}/attachment/${a.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/share/${token}/attachment/${a.id}`} alt={a.name} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

