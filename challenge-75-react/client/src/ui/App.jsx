import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import DayCard from './DayCard.jsx'
import DetailsModal from './DetailsModal.jsx'
import Goals from './Goals.jsx'
import Reports from './Reports.jsx'
import Settings from './Settings.jsx'
import Ascetics from './Ascetics.jsx'
import AuthModal from './AuthModal.jsx'
import SharePublic from './SharePublic.jsx'
import Friends from './Friends.jsx'
import Spinner from './Spinner.jsx'

const defaultKeys = ['wo1','wo2','diet','water','read','photo']

export default function App() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [tab, setTab] = useState('progress')
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('pink')

  function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); setTheme(t) }

  async function load() {
    try {
      setLoading(true)
      setError('')
      const s = await api.state()
      setState(s)
    } catch (e) {
      setError('Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  // Bootstrap: restore session first, then load state
  useEffect(() => {
    (async()=>{
      try {
        setLoading(true)
        setError('')
        const me = await api.auth.me()
        const u = me.user || null
        setUser(u)
        if (u?.theme) applyTheme(u.theme)
        const s = await api.state()
        setState(s)
      } catch (e) {
        setError('Не удалось загрузить данные')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(()=>{ document.documentElement.setAttribute('data-theme', theme) }, [theme])

  const stats = useMemo(() => {
    if (!state) return null
    const keys = (state.taskTypes?.map(t=>t.key) || defaultKeys)
    const tasksTotal = state.days.length * keys.length
    let tasksDone = 0, fullDays = 0
    const weights = []
    for (const d of state.days) {
      const done = keys.reduce((a, k) => a + (d.tasks[k] ? 1 : 0), 0)
      tasksDone += done
      if (done === keys.length) fullDays++
      if (typeof d.weight === 'number') weights.push(d.weight)
    }
    const percent = Math.round((tasksDone / tasksTotal) * 100)
    const weightStats = weights.length ? {
      min: Math.min(...weights),
      max: Math.max(...weights),
      avg: +(weights.reduce((a,b)=>a+b,0)/weights.length).toFixed(1),
      last: weights[weights.length-1]
    } : null
    return { tasksDone, tasksTotal, fullDays, percent, weightStats }
  }, [state])

  async function updateTasks(day, patch) {
    const s = await api.setTasks(day, patch)
    setState(s)
  }

  async function updateDetails(day, patch) {
    const s = await api.setDetails(day, patch)
    setState(s)
  }

  // Public share viewer route
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/share/')) {
    const token = window.location.pathname.split('/').pop()
    return <SharePublic token={token} />
  }

  if (loading) return <div className="container" style={{display:'grid', placeItems:'center', minHeight:'40vh'}}><Spinner size={42}/><div className="muted" style={{marginTop:8}}>Загружаем ваш прогресс…</div></div>
  if (error) return <div className="container"><div className="empty">{error}</div></div>

  return (
    <div className="container">
      <header>
        <h1>Челлендж 75 Сложных Дней</h1>
        <AuthModal user={user} onAuthChange={async (u)=>{ setUser(u); if (u?.theme) applyTheme(u.theme); await load() }} />
        {stats && (
          <div className="muted" style={{marginTop:8}}>
            Прогресс: {stats.percent}% | Задач: {stats.tasksDone}/{stats.tasksTotal} | Дней закрыто: {stats.fullDays}/75
            {stats.weightStats && (
              <> | Вес (мин/ср/макс/посл): {stats.weightStats.min}/{stats.weightStats.avg}/{stats.weightStats.max}/{stats.weightStats.last}</>
            )}
          </div>
        )}
        <div className="tabs">
          <div className={"tab" + (tab==='progress'?' active':'')} onClick={()=>setTab('progress')}>Прогресс</div>
          <div className={"tab" + (tab==='reports'?' active':'')} onClick={()=>setTab('reports')}>Отчёты (каждые 15 дней)</div>
          <div className={"tab" + (tab==='settings'?' active':'')} onClick={()=>setTab('settings')}>Настройки</div>
          <div className={"tab" + (tab==='ascetic'?' active':'')} onClick={()=>setTab('ascetic')}>Аскеза</div>
          <div className={"tab" + (tab==='friends'?' active':'')} onClick={()=>setTab('friends')}>Друзья</div>
        </div>
      </header>

      {tab==='progress' && (
        <section style={{marginTop:16}}>
          <div className="grid">
            {state.days.map(d => {
              const keys = state.taskTypes?.map(t=>t.key) || defaultKeys
              return (
                <DayCard key={d.day} day={d} taskTypes={state.taskTypes||[]} onToggle={(k, v)=>updateTasks(d.day, {[k]:v})} onToggleAll={()=>{
                  const allDone = keys.every(k => d.tasks[k])
                  const patch = Object.fromEntries(keys.map(k => [k, !allDone]))
                  updateTasks(d.day, patch)
                }} onOpenDetails={()=>setDetails(d)} onQuickPhoto={async (e)=>{
                  const files = Array.from(e.target.files||[])
                  if (files.length===0) return
                  await api.attachments.upload(d.day, files)
                  alert('Фото добавлено! Откройте «Детали», чтобы посмотреть.')
                  e.target.value=''
                }} />
              )
            })}
          </div>
        </section>
      )}

      {tab==='reports' && (
        <section style={{marginTop:16}}>
          <Reports state={state} />
        </section>
      )}

      {tab==='settings' && (
        <section style={{marginTop:16}}>
          <Settings onChanged={load} state={state} />
          <div style={{marginTop:16}}>
            <Goals />
          </div>
          <div className="row" style={{marginTop:16}}>
            <button className="btn danger" onClick={async ()=>{ if (confirm('Сбросить все данные?')) { const s=await api.reset(); setState(s) } }}>Сбросить все</button>
          </div>
        </section>
      )}

      {tab==='ascetic' && (
        <section style={{marginTop:16}}>
          <Ascetics />
        </section>
      )}

      {tab==='friends' && (
        <section style={{marginTop:16}}>
          <Friends />
        </section>
      )}

      {details && (
        <DetailsModal day={details} onClose={()=>setDetails(null)} onSave={async (patch)=>{ await updateDetails(details.day, patch); setDetails(null) }} />
      )}
    </div>
  )
}
